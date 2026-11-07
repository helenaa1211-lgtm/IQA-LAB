import requests
import schedule
import time
import base64
import ddddocr
import pandas as pd
import glob
import os
import io
import json
import smtplib
import traceback
import numpy as np
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium import webdriver
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload


ocr = ddddocr.DdddOcr(show_ad=False)

SITE_URL        = os.getenv("SITE_URL") or "https://cloud.daqinwulian.cn/login?redirect=%2Findex"
USERNAME       = os.getenv("EMP_USERNAME") or "Bengal9"
PASSWORD       = os.getenv("EMP_PASSWORD") or "@LQAPucRio"
XPATH_AUTHCODE = (
    "//input["
    "contains(translate(@placeholder, 'AUTHCODE', 'authcode'), 'authcode') or "
    "contains(@id, 'auth') or contains(@name, 'auth') or "
    "contains(@class, 'captcha') or contains(@placeholder, 'Code')"
    "]"
)
# Adicione ou ajuste essas variáveis no topo do seu script:
EMAIL_REMETENTE = "helenaa.1211@gmail.com"        # O seu e-mail do Gmail
SENHA_REMETENTE = "ouwl zijh mbyc sntm"       # A SENHA DE APP DE 16 DÍGITOS que você gerou
EMAIL_DESTINATARIO = "helenaa.1211@gmail.com"     # Para onde o relatório deve ir (pode ser o seu mesmo)
ID_PASTA_DRIVE = os.getenv("GOOGLE_DRIVE_FOLDER_ID") or "1w-dx2f457PLQoaINizQvNgNbWFkz6Pxt"
PASTA_DOWNLOADS = os.getcwd() 

MINIMO_MEDICOES_HORA = 55   
MINIMO_MEDICOES_DIA  = 1380 

NOMES_ARQUIVOS_DRIVE = {
    "bruto":   "Sensor_Referencia_PUC_Bruto.xlsx",
    "horario": "Sensor_Referencia_PUC_Media_Horaria.xlsx",
    "diario":  "Sensor_Referencia_PUC_Media_Diaria.xlsx",
}

COLUNAS_APAGAR = [
    "SD", "L95", "L50", "L05", "LAeq8h", "LAE", "LCpeak", "NDA", "EA",
    "水温（°C）", "电导率（微西[门子]/厘米）", "溶解氧（mg/L）", "浊度（NTU）", "pH值",
    "高锰酸盐指数（mg/L）", "化学需氧量（COD）（mg/L）", "总磷（mg/L）", "氨氮（mg/L）", "总氮（mg/L）",
    "纬度", "纬度半球", "经度", "经度半球", "丙烷", "备电", "氟化氢（ppm）",
    "PM1.0（mg/m3）", "PM5（mg/m3）", "O3定制（ppb）", "H2SO4（ppm）",
    "CH4S", "C2H6S", "C3H9N", "C2H6S2", "C8H8", "CS2",
    "CH2O（mg/m3）", "C8H10（mg/m3）", "烟尘（mg/m3）", "烟气流速（m/s）",
    "烟气压力（kPa）", "烟气温度（℃）", "一氧化氮（mg/m3）", "氮氧化物（ug/m3）",
    "警告状态", "运行状态", "氩气（ppm）", "HCL（ppm）", "HC（ppm）", "HCN（ppm）",
    "VOC定制（ppm）", "OU", "Leq（db）", "L90（dB）", "L10（dB）", "LAeq（dB）",
    "Lmin（dB）", "Lmax（dB）", "UV（mW/m2）", "RA（w/㎡）",
    "TSP（ug/m3）", "TVOC（ppm）", "tvoc（mg/m3）", "VOC（mg/m3）",
    "噪音（dB）", "RAIN（mm）", "照度（lux）",
    "H2S（ppm）", "NH3（ppm）", "O2（ppm）", "CO2（ppm）",
]

COLUNAS_RENOMEAR = {
    # Meteorologia
    "温度(℃)": "temperatura",
    "湿度(%RH)": "umidade",
    "气压(hPa)": "pressao_atmosferica",
    "风速(m/s)": "velocidade_vento",
    "风向(°)": "direcao_vento",
    
    # Poluentes
    "PM2.5(ug/m3)": "pm25",
    "PM10(ug/m3)": "pm10",
    "CO(mg/m3)": "co",
    "SO2(ug/m3)": "so2",
    "NO2(ug/m3)": "no2",
    "O3(ug/m3)": "o3",
    
    # Chaves alternativas (caso venham sem unidade do portal chinês)
    "PM2.5": "pm25",
    "PM10": "pm10",
    "CO": "co",
    "SO2": "so2",
    "NO2": "no2",
    "O3": "o3",
}

def verificar_medicoes_incompletas(df_horario, df_diario, col_tempo):
    avisos = []

    horas_incompletas = df_horario[df_horario["Qtd medicao"] < MINIMO_MEDICOES_HORA]
    if not horas_incompletas.empty:
        avisos.append("Médias HORÁRIAS incompletas:")
        for _, row in horas_incompletas.iterrows():
            hora = pd.to_datetime(row[col_tempo]).strftime("%d/%m/%Y %H:%M")
            avisos.append(f"   - {hora} → {int(row['Qtd medicao'])} medições (esperado: 60)")

    dias_incompletas = df_diario[df_diario["Qtd medicao"] < MINIMO_MEDICOES_DIA]
    if not dias_incompletas.empty:
        avisos.append("\nMédias DIÁRIAS incompletas:")
        for _, row in dias_incompletas.iterrows():
            dia = pd.to_datetime(row[col_tempo]).strftime("%d/%m/%Y")
            avisos.append(f"   - {dia} → {int(row['Qtd medicao'])} medições (esperado: 1440)")

    return "\n".join(avisos) if avisos else None

def enviar_relatorios_por_email(arquivos_para_enviar, aviso_medições=None):
    print("Preparando o envio do e-mail com os relatórios...")
    
    msg = MIMEMultipart()
    msg['From'] = EMAIL_REMETENTE
    msg['To'] = EMAIL_DESTINATARIO
    msg['Subject'] = f"📊 Relatório Automação Sensor PUC-Rio - {datetime.now().strftime('%d/%m/%Y')}"
    
    # Corpo do e-mail
    corpo = "Olá!\n\nOs relatórios diários do Sensor de Referência da PUC-Rio foram gerados com sucesso.\n"
    if aviso_medições:
        corpo += f"\n⚠️ ATENÇÃO - ALERTAS DE MEDIÇÕES INCOMPLETAS:\n{aviso_medições}\n"
    else:
        corpo += "\n✅ Todas as medições do período estão completas.\n"
        
    corpo += "\nOs arquivos estão anexados a este e-mail.\n\nAtenciosamente,\nRobô de Automação."
    msg.attach(MIMEText(corpo, 'plain'))
    
    # Anexa cada um dos arquivos Excel gerados localmente
    for nome_exibicao, caminho_arquivo in arquivos_para_enviar.items():
        if os.path.exists(caminho_arquivo):
            with open(caminho_arquivo, "rb") as f:
                part = MIMEText(f.read(), 'base64', 'utf-8')
                part.add_header('Content-Disposition', f'attachment; filename="{nome_exibicao}"')
                msg.attach(part)
                print(f"Arquivo anexado: {nome_exibicao}")
                
    # Conecta ao servidor do Gmail e envia
    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server: # Usa a porta padrão TLS do Gmail
            server.starttls()
            server.login(EMAIL_REMETENTE, SENHA_REMETENTE.replace(" ", ""))
            server.sendmail(EMAIL_REMETENTE, EMAIL_DESTINATARIO, msg.as_string())
        print("E-mail enviado com sucesso com todos os anexos!")
    except Exception as e:
        print(f"Erro ao enviar o e-mail: {e}")

def merge_sem_duplicatas(df_drive, df_novo, col_tempo):
    df_drive[col_tempo] = pd.to_datetime(df_drive[col_tempo])
    df_novo[col_tempo]  = pd.to_datetime(df_novo[col_tempo])
    df_merged = pd.concat([df_drive, df_novo], ignore_index=True)
    df_merged = df_merged.drop_duplicates(subset=[col_tempo], keep="last")
    df_merged = df_merged.sort_values(col_tempo).reset_index(drop=True)
    return df_merged

def salvar_no_drive(service, df, nome, col_tempo):
    print(f"Salvando '{nome}' no Drive...")
    file_id = buscar_arquivo_drive(service, nome)
    if file_id:
        print(f"Arquivo encontrado, baixando para merge")
        df_existente = baixar_df_drive(service, file_id)
        df_final = merge_sem_duplicatas(df_existente, df, col_tempo)
        linhas_novas = len(df_final) - len(df_existente)
        print(f"{linhas_novas} linhas novas adicionadas ({len(df_final)} total)")
    else:
        print(f"Arquivo não encontrado no Drive, criando novo")
        df_final = df
    cols_num = df_final.select_dtypes(include="number").columns
    df_final[cols_num] = df_final[cols_num].round(4)
    upload_df_drive(service, df_final, nome, file_id)

# SUBSTITUA a antiga função calcular_periodo_ontem() por esta:
def calcular_periodo_ultima_hora():
    agora = datetime.now()
    uma_hora_atras = agora - timedelta(hours=1)
    
    # Retorna o intervalo exato dos últimos 60 minutos
    inicio = uma_hora_atras.strftime("%Y-%m-%d %H:%M:%S")
    fim = agora.strftime("%Y-%m-%d %H:%M:%S")
    return inicio, fim

def selecionar_idioma_english(driver, wait):
    radio_english = wait.until(EC.presence_of_element_located(
        (By.XPATH, "//input[@type='radio' and @value='en']")
    ))
    driver.execute_script("arguments[0].click();", radio_english)
    time.sleep(1)

def ocr_captcha(driver):
    """
    Obtém os bytes da imagem do CAPTCHA de forma robusta e classifica via dddddocr.
    Trata Base64, requisição HTTP via Cookies e Screenshot de tela inteira (crop).
    """
    try:
        time.sleep(1.5)
        
        captcha_img = driver.find_element(By.XPATH, "//div[contains(@class,'login-code')]/img")
        img_src = captcha_img.get_attribute("src") or ""

        # CASO 1: Formato Base64 Data URL (data:image/png;base64,...)
        if "," in img_src and "data:image" in img_src:
            img_bytes = base64.b64decode(img_src.split(",")[1])

        # CASO 2: URL Normal / Endpoint HTTP (Baixa usando a sessão/cookies do Chrome)
        elif img_src.startswith("http"):
            session = requests.Session()
            # Copia os cookies do Selenium para manter a mesma sessão de login
            for cookie in driver.get_cookies():
                session.cookies.set(cookie['name'], cookie['value'])
            
            headers = {"User-Agent": driver.execute_script("return navigator.userAgent;")}
            response = session.get(img_src, headers=headers, timeout=10)
            img_bytes = response.content

        # CASO 3: Tenta o screenshot do elemento ou captura da janela inteira
        else:
            try:
                img_bytes = captcha_img.screenshot_as_png
            except Exception:
                # Se o elemento tiver largura 0, captura a tela do driver diretamente
                img_bytes = driver.get_screenshot_as_png()

        # Executa a classificação no OCR
        resultado = ocr.classification(img_bytes)
        return resultado.strip() if resultado else ""

    except Exception as e:
        print(f"⚠️ Erro ao capturar ou processar o CAPTCHA: {e}")
        return ""

def fazer_login(driver, wait):
    driver.get(SITE_URL)
    
    # 1. Troca o idioma
    selecionar_idioma_english(driver, wait)
    time.sleep(2) # Pausa estratégica para re-renderização da tela pós-idioma

    # 2. Verifica se a página utiliza iframe
    if len(driver.find_elements(By.TAG_NAME, "iframe")) > 0:
        print("ℹ️ IFrame detectado! Alternando contexto para o iframe...")
        driver.switch_to.frame(0)

    # XPath abrangente para encontrar o campo do CAPTCHA independente de maiúsculas/minúsculas
    xpath_auth = (
        "//input["
        "contains(translate(@placeholder, 'AUTHCODE', 'authcode'), 'authcode') or "
        "contains(translate(@placeholder, 'CODE', 'code'), 'code') or "
        "contains(@id, 'auth') or contains(@name, 'auth') or "
        "contains(@class, 'captcha')"
        "]"
    )

    for tentativa in range(10):
        print(f"\n--- Tentativa {tentativa + 1} de 10 ---")

        # Preenche Usuário e Senha
        try:
            campo_account = wait.until(EC.presence_of_element_located((
                By.XPATH, "//input[contains(translate(@placeholder, 'ACCOUNT', 'account'), 'account') or @type='text']"
            )))
            campo_password = wait.until(EC.presence_of_element_located((
                By.XPATH, "//input[contains(translate(@placeholder, 'PASSWORD', 'password'), 'password') or @type='password']"
            )))
            
            campo_account.clear()
            campo_account.send_keys(USERNAME)
            
            campo_password.clear()
            campo_password.send_keys(PASSWORD)
        except Exception as e:
            print(f"⚠️ Aviso ao preencher usuário/senha: {e}")

        # Tenta localizar o campo do CAPTCHA com a busca flexível
        try:
            campo_auth = wait.until(
                EC.element_to_be_clickable((By.XPATH, xpath_auth))
            )
        except Exception:
            print("❌ Não foi possível encontrar o campo de CAPTCHA/AuthCode na tela.")
            print("Inspeção de apoio: Imprimindo placeholders presentes na tela:")
            inputs = driver.find_elements(By.TAG_NAME, "input")
            for i, inp in enumerate(inputs):
                print(f"  Input {i+1}: placeholder='{inp.get_attribute('placeholder')}', id='{inp.get_attribute('id')}', type='{inp.get_attribute('type')}'")
            
            time.sleep(2)
            continue

        # Executa OCR no CAPTCHA
        texto_captcha = ocr_captcha(driver)
        print(f"CAPTCHA reconhecido pelo OCR: '{texto_captcha}'")

        if not texto_captcha or len(texto_captcha) < 3:
            print("Texto de CAPTCHA inválido ou muito curto. Tentando novamente...")
            time.sleep(2)
            continue

        # Preenche o CAPTCHA
        campo_auth.clear()
        campo_auth.send_keys(texto_captcha)

        # Clica no botão 'Sign in'
        try:
            btn_signin = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[.//span[text()='Sign in'] or contains(., 'Sign in') or contains(., 'Login')]"))
            )
            btn_signin.click()
        except Exception:
            btn_signin = driver.find_element(By.XPATH, "//button[.//span[text()='Sign in'] or contains(., 'Sign in') or contains(., 'Login')]")
            driver.execute_script("arguments[0].click();", btn_signin)

        time.sleep(4)

        # Valida se o login teve sucesso
        elementos_internos = driver.find_elements(By.XPATH, "//i[contains(@class, 'icon-peizhi')]")
        campos_account = driver.find_elements(By.XPATH, "//input[contains(translate(@placeholder, 'ACCOUNT', 'account'), 'account')]")

        if elementos_internos or not campos_account or not campos_account[0].is_displayed():
            print("✅ Login realizado com sucesso!")
            return True

        print("❌ Autenticação falhou. CAPTCHA incorreto. Tentando novamente...")
        time.sleep(1)

    return False

def passo1_abrir_menu(driver, wait):
    driver.switch_to.default_content()
    time.sleep(3)
    seletores = [
        (By.CSS_SELECTOR, "i.iconfont.icon-peizhi"),
        (By.XPATH, "//i[contains(@class,'icon-peizhi')]"),
        (By.XPATH, "//i[@title='AdminConfig']"),
        (By.CSS_SELECTOR, "i[title='AdminConfig']"),
    ]
    for by, seletor in seletores:
        try:
            elemento = wait.until(EC.presence_of_element_located((by, seletor)))
            driver.execute_script("arguments[0].scrollIntoView(true);", elemento)
            driver.execute_script("arguments[0].click();", elemento)
            print(f"Menu aberto com seletor: {seletor}")
            time.sleep(1.5)
            return
        except Exception as e:
            print(f"Falhou com '{seletor}': {e}")
            continue
    driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_menu.png"))
    raise Exception("Não foi possível encontrar o botão AdminConfig")

def passo2_navegar_history_data(driver, wait):
    seletores_datacenter = [
        (By.XPATH, "//div[contains(@class,'el-submenu__title')][.//span[text()='Data center']]"),
        (By.XPATH, "//li[contains(@class,'el-submenu')][.//span[text()='Data center']]"),
        (By.XPATH, "//*[contains(@class,'el-submenu')]//span[text()='Data center']"),
        (By.XPATH, "//*[text()='Data center']/ancestor::li"),
    ]
    
    data_center = None
    for by, seletor in seletores_datacenter:
        try:
            data_center = WebDriverWait(driver, 15).until(EC.presence_of_element_located((by, seletor)))
            print(f"Menu Data center encontrado com: {seletor}")
            break
        except:
            print(f"Seletor Data center falhou: {seletor}")
            continue
            
    if not data_center:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo2_datacenter.png"))
        raise Exception("Não foi possível encontrar the menu 'Data center'")
        
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", data_center)
    time.sleep(1)
    try:
        data_center.click()
    except Exception:
        driver.execute_script("arguments[0].click();", data_center)
        
    time.sleep(4) 

    seletores_history = [
        (By.XPATH, "//li[contains(@class,'el-menu-item') and contains(.,'History data')]"),
        (By.XPATH, "//span[text()='History data']/ancestor::li"),
        (By.XPATH, "//a[contains(.,'History data')]"),
        (By.XPATH, "//*[contains(text(),'History data')]"),
    ]
    
    history_data = None
    for by, seletor in seletores_history:
        try:
            history_data = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((by, seletor)))
            print(f"History data encontrado com: {seletor}")
            break
        except:
            print(f"Seletor History data falhou: {seletor}")
            continue
            
    if not history_data:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo2_history_data.png"))
        raise Exception("Não encontrou o item 'History data' no menu")
        
    try:
        history_data.click()
    except Exception:
        driver.execute_script("arguments[0].click();", history_data)
        
    time.sleep(3)

def passo1_5_garantir_sidebar_aberta(driver, wait):
    driver.switch_to.default_content()
    
    sidebar_escondida = False
    try:
        app_wrapper = driver.find_element(By.CSS_SELECTOR, ".app-wrapper")
        classes = app_wrapper.get_attribute("class")
        if "hideSidebar" in classes:
            sidebar_escondida = True
            print("O menu lateral está escondido.")
    except Exception:
        sidebar_escondida = True  

    if sidebar_escondida:
        seletores_hamburger = [
            (By.CSS_SELECTOR, ".hamburger-container"),
            (By.CSS_SELECTOR, ".hamburger"),
            (By.XPATH, "//*[contains(@class, 'hamburger-container')]"),
            (By.XPATH, "//*[contains(@class, 'hamburger')]")
        ]
        
        btn_hamburger = None
        for by, sel in seletores_hamburger:
            try:
                btn_hamburger = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((by, sel)))
                print(f"Botão hambúrguer localizado com: {sel}")
                break
            except:
                pass
                
        if not btn_hamburger:
            driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "erro_localizar_hamburger.png"))
            raise Exception("Não encontrei o botão hambúrguer para expandir o menu.")
            
        try:
            btn_hamburger.click()
        except Exception:
            try:
                ActionChains(driver).move_to_element(btn_hamburger).click().perform()
            except Exception:
                driver.execute_script("arguments[0].click();", btn_hamburger)
                
        time.sleep(3)
    else:
        print("A barra lateral já está aberta.")

def passo3_selecionar_site(driver, wait):
    driver.switch_to.default_content()
    time.sleep(2)

    cascader_wrapper = None
    seletores_busca = [
        (By.CSS_SELECTOR, ".el-cascader"),
        (By.XPATH, "//div[contains(@class,'el-cascader')]"),
        (By.CSS_SELECTOR, ".el-cascader .el-input__inner"),
        (By.XPATH, "//input[contains(@placeholder, 'site') or contains(@placeholder, 'Site') or contains(@placeholder, 'Please select')]"),
    ]
    
    # 1. Localiza o componente Cascader
    for tentativa in range(5):
        for by, sel in seletores_busca:
            try:
                cascader_wrapper = WebDriverWait(driver, 3).until(EC.visibility_of_element_located((by, sel)))
                print(f"Visual encontrado com: '{sel}' (tentativa {tentativa + 1})")
                break
            except Exception:
                pass
        if cascader_wrapper:
            break
        time.sleep(2)

    if not cascader_wrapper:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo3_nao_renderizou.png"))
        raise Exception("O seletor dropdown não ficou visível na tela após o tempo limite.")

    # 2. Força o foco e abre o menu via JS
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", cascader_wrapper)
    time.sleep(1)
    print("Disparando clique para abrir o menu dropdown")
    driver.execute_script("arguments[0].click();", cascader_wrapper)
    time.sleep(2)

    # 3. Localiza e clica na opção 'LQA PUC Rio' via JS
    seletores_lqa = [
        (By.XPATH, "//span[contains(@class,'el-cascader-node__label') and contains(text(),'LQA PUC Rio')]"),
        (By.XPATH, "//*[contains(text(),'LQA PUC Rio')]"),
        (By.XPATH, "//li[contains(@class,'el-cascader-node')][.//span[contains(.,'LQA PUC Rio')]]"),
    ]
    label_lqa = None
    for by, sel in seletores_lqa:
        try:
            label_lqa = WebDriverWait(driver, 5).until(EC.presence_of_element_located((by, sel)))
            print(f"Opção 'LQA PUC Rio' visível: {sel}")
            break
        except Exception:
            pass

    if not label_lqa:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo3_lqa_erro.png"))
        raise Exception("Não encontrei a opção 'LQA PUC Rio' no menu aberto")

    # Garante a visibilidade e clica via JS para disparar o sub-menu
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'}); arguments[0].click();", label_lqa)
    time.sleep(2)

    # 4. Localiza e clica no Checkbox '0359'
    seletores_0359 = [
        (By.XPATH, "//li[contains(@class,'el-cascader-node')][.//span[contains(text(),'0359')]]//label[contains(@class,'el-checkbox')]"),
        (By.XPATH, "//li[contains(@class,'el-cascader-node')][.//span[contains(.,'0359')]]//label"),
        (By.XPATH, "//*[contains(text(),'0359')]/ancestor::li//label"),
    ]
    checkbox_0359 = None
    for by, sel in seletores_0359:
        try:
            checkbox_0359 = WebDriverWait(driver, 5).until(EC.presence_of_element_located((by, sel)))
            print(f"Checkbox 0359 pronto para clique: {sel}")
            break
        except Exception:
            pass

    if not checkbox_0359:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo3_0359_erro.png"))
        raise Exception("Não encontrei o checkbox do site '0359'")

    driver.execute_script("arguments[0].scrollIntoView({block: 'center'}); arguments[0].click();", checkbox_0359)
    time.sleep(1)

    # Fecha o menu suspenso enviando ESC
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(1)

def passo4_selecionar_contaminant(driver, wait):
    seletores_cont = [
        (By.XPATH, "(//div[contains(@class,'el-select') and contains(@class,'el-select--small')])[1]"),
        (By.XPATH, "(//div[contains(@class,'el-select')])[1]"),
        (By.XPATH, "//input[@placeholder='Contaminant']/ancestor::div[contains(@class,'el-select')]"),
        (By.XPATH, "//div[contains(@class,'el-select')]//input[@placeholder]"),
    ]
    select_cont = None
    for by, sel in seletores_cont:
        try:
            select_cont = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((by, sel)))
            print(f"Select contaminant encontrado com: {sel}")
            break
        except:
            print(f"Select contaminant falhou: {sel}")
    if not select_cont:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo4_select.png"))
        raise Exception("Nao encontrei o select de contaminante")
    ActionChains(driver).move_to_element(select_cont).click().perform()
    time.sleep(1.5)

    seletores_all = [
        (By.XPATH, "//li[contains(@class,'el-select-dropdown__item')][.//span[contains(text(),'SelectAll') or contains(text(),'--SelectAll--')]]"),
        (By.XPATH, "//li[contains(@class,'el-select-dropdown__item')][contains(.,'SelectAll')]"),
        (By.XPATH, "//*[contains(text(),'SelectAll')]"),
    ]
    select_all = None
    for by, sel in seletores_all:
        try:
            select_all = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((by, sel)))
            print(f"SelectAll encontrado com: {sel}")
            break
        except:
            print(f"SelectAll falhou: {sel}")
    if not select_all:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo4_selectall.png"))
        raise Exception("Nao encontrou a opção SelectAll")
    ActionChains(driver).move_to_element(select_all).click().perform()
    time.sleep(1)
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(1)

def passo5_selecionar_intervalo(driver, wait):
    print("\n--- Selecionando Intervalo / TimeType ---")
    
    # 1. Localiza e clica na caixa de seleção 'TimeType' para ABRIR o menu
    try:
        # Tenta localizar o input do el-select correspondente
        select_input = wait.until(
            EC.element_to_be_clickable((
                By.XPATH, 
                "//div[contains(@class,'el-select') and .//input[contains(@placeholder,'Time') or contains(@placeholder,'Type')]]"
            ))
        )
        driver.execute_script("arguments[0].click();", select_input)
    except Exception:
        # Fallback: Se não achar pelo placeholder, tenta o 2º elemento el-select na página
        selects = driver.find_elements(By.XPATH, "//div[contains(@class,'el-select')]")
        if len(selects) >= 2:
            driver.execute_script("arguments[0].click();", selects[1])
        elif selects:
            driver.execute_script("arguments[0].click();", selects[0])

    time.sleep(1.5)  # Tempo para a animação do dropdown abrir no Element UI

    # 2. Busca pela opção '1 Minute' (ou variações/traduções)
    # Lista de possíveis textos que o menu pode exibir dependendo do idioma
    opcoes_texto = ["1 Minute", "1Min", "1 min", "1min", "1分钟"]
    
    opcao_encontrada = None

    # Tenta encontrar por texto visível dentro de elementos li do Element UI
    for texto in opcoes_texto:
        xpath_li = f"//li[contains(@class,'el-select-dropdown__item') and (contains(.,'{texto}') or translate(text(), 'MINUTE', 'minute')='1 minute')]"
        elementos = driver.find_elements(By.XPATH, xpath_li)
        
        # Filtra elementos que estão visíveis na tela
        elementos_visiveis = [el for el in elementos if el.is_displayed()]
        if elementos_visiveis:
            opcao_encontrada = elementos_visiveis[0]
            print(f"✅ Opção de intervalo encontrada: '{texto}'")
            break

    # 3. Executa o clique na opção encontrada
    if opcao_encontrada:
        try:
            # Tenta o clique direto do Selenium
            opcao_encontrada.click()
        except Exception:
            # Se der erro de sobreposição, clica via JavaScript
            driver.execute_script("arguments[0].click();", opcao_encontrada)
        time.sleep(1)
        return True
    
    # DIAGNÓSTICO DE EMERGÊNCIA: Se não encontrou nenhuma opção
    print("❌ Falha ao encontrar '1 Minute'. Imprimindo todas as opções visíveis no dropdown:")
    opcoes_disponiveis = driver.find_elements(By.XPATH, "//li[contains(@class,'el-select-dropdown__item')]")
    for idx, item in enumerate(opcoes_disponiveis):
        if item.is_displayed():
            print(f"   Opção {idx + 1}: '{item.text.strip()}'")
            # Tenta clicar na primeira opção se nenhuma bater com '1 Minute'
            if idx == 0:
                print(f"⚠️ Clicando na opção alternativa '{item.text.strip()}' para dar sequência ao robô...")
                driver.execute_script("arguments[0].click();", item)
                return True

    raise Exception("Não foi possível localizar nenhuma opção válida no menu TimeType.")

def calcular_periodo_ultima_hora():
    """
    Calcula o intervalo fechado da HORA ANTERIOR (60 minutos completos).
    Exemplo: Se rodar às 09:04, retorna ('2026-09-02 08:00:00', '2026-09-02 08:59:00')
    """
    agora = datetime.now()
    hora_passada = agora - timedelta(hours=1)
    
    inicio = hora_passada.strftime("%Y-%m-%d %H:00:00")
    fim = hora_passada.strftime("%Y-%m-%d %H:59:00")
    
    return inicio, fim

def passo6_preencher_datas(driver, wait):
    inicio, fim = calcular_periodo_ultima_hora()
    print(f"Buscando hora cheia anterior (60 min completos): {inicio} -> {fim}")

    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(1)
    driver.find_element(By.XPATH, "//body").click()
    time.sleep(1)

    seletores_campos = [
        "//div[contains(@class,'el-date-editor--datetimerange')]//input[contains(@class,'el-range-input')]",
        "//div[contains(@class,'el-date-editor')]//input[contains(@class,'el-range-input')]",
        "//input[contains(@class,'el-range-input')]",
    ]
    campos = []
    for sel in seletores_campos:
        campos = driver.find_elements(By.XPATH, sel)
        if len(campos) >= 2:
            print(f"Campos de data encontrados: {sel}")
            break
    if len(campos) < 2:
        driver.save_screenshot(os.path.join(PASTA_DOWNLOADS, "debug_passo6_campos.png"))
        raise Exception(f"Nao encontrei os campos de data (encontrou {len(campos)})")

    # Limpar via JS antes de digitar para evitar sobreposição de texto
    driver.execute_script("arguments[0].value = '';", campos[0])
    campos[0].send_keys(inicio)
    time.sleep(0.5)

    driver.execute_script("arguments[0].value = '';", campos[1])
    campos[1].send_keys(fim)
    time.sleep(0.5)

    campos[1].send_keys(Keys.ENTER)
    time.sleep(0.8)
    driver.find_element(By.XPATH, "//body").click()
    time.sleep(0.8)

def passo7_pesquisar(driver, wait):
    # 1. Tenta fechar qualquer calendário/modal sobreposto com ESCAPE
    try:
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.5)
    except Exception:
        pass

    # 2. Seletores abrangentes (Classe Element UI, Textos em Inglês/Português e Ícone de Pesquisa)
    seletores_search = [
        # Por texto em inglês ou português
        (By.XPATH, "//button[contains(.,'Search') or contains(.,'Pesquisar') or contains(.,'Buscar') or contains(.,'Consultar')]"),
        # Pela classe do botão primário da Element UI contendo o ícone de busca
        (By.CSS_SELECTOR, "button.el-button--primary i.el-icon-search"),
        # Botão primário genérico do formulário
        (By.CSS_SELECTOR, "button.el-button--primary"),
        # Qualquer botão com classe de ícone de pesquisa
        (By.XPATH, "//button[.//i[contains(@class,'search')]]"),
        # XPath mais flexível ignorando maiúsculas/minúsculas
        (By.XPATH, "//button[contains(translate(., 'SEARCH', 'search'), 'search')]"),
    ]

    botao = None
    for by, sel in seletores_search:
        try:
            # Busca elemento na página
            elementos = driver.find_elements(by, sel)
            for elem in elementos:
                if elem.is_displayed():
                    # Se encontrou o ícone dentro do botão, pega o botão pai
                    if elem.tag_name != "button":
                        botao = elem.find_element(By.XPATH, "./ancestor::button")
                    else:
                        botao = elem
                    print(f"✅ Botão de pesquisa encontrado usando o seletor: {sel}")
                    break
            if botao:
                break
        except Exception as e:
            continue

    if not botao:
        # Tira print para ver exatamente como a tela estava quando falhou
        caminho_screenshot = os.path.join(PASTA_DOWNLOADS, "debug_passo7_search.png")
        driver.save_screenshot(caminho_screenshot)
        print(f"📸 Screenshot gravado em: {caminho_screenshot}")
        raise Exception("Não encontrei o botão de pesquisa/Search.")

    # 3. Tenta clicar (usa JavaScript como fallback se o clique nativo for interceptado)
    try:
        botao.click()
    except Exception:
        print("Clique nativo bloqueado. Forçando clique via JavaScript...")
        driver.execute_script("arguments[0].click();", botao)

    time.sleep(6)

def passo8_exportar(driver, wait):
    # 1. Localiza e clica no botão 'Export'
    seletores_export = [
        (By.XPATH, "//button[contains(@class,'el-button--warning')][.//span[text()='Export']]"),
        (By.XPATH, "//button[contains(.,'Export') or contains(.,'Exportar')]"),
        (By.CSS_SELECTOR, "button.el-button--warning"),
    ]
    
    botao_export = None
    for by, sel in seletores_export:
        try:
            botao_export = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, sel)))
            print(f"Export encontrado com: {sel}")
            break
        except Exception:
            continue

    if not botao_export:
        raise Exception("Não encontrei o botão Export")

    # Clica no Export (usando JS de fallback caso esteja bloqueado)
    try:
        botao_export.click()
    except Exception:
        print("Clique nativo no Export bloqueado. Executando clique via JavaScript...")
        driver.execute_script("arguments[0].click();", botao_export)

    # 2. Aguarda a caixa de diálogo (modal) aparecer
    print("Aguardando caixa de mensagem/confirmação surgir...")
    time.sleep(1.5)

    # 3. Lista expandida de seletores para o botão de confirmação
    seletores_confirm = [
        # O botão principal da caixa de mensagem da Element UI (Padrão mais confiável)
        (By.CSS_SELECTOR, ".el-message-box__btns button.el-button--primary"),
        # Por texto em inglês ou português
        (By.XPATH, "//div[contains(@class,'el-message-box')]//button[contains(.,'Confirm') or contains(.,'OK') or contains(.,'Confirmar') or contains(.,'Yes')]"),
        # Por estrutura genérica de botões no modal
        (By.XPATH, "//div[contains(@class,'el-message-box__btns')]//button[last()]"),
        # Texto direto em span dentro do modal
        (By.XPATH, "//div[contains(@class,'el-message-box')]//span[contains(text(),'OK') or contains(text(),'Confirm')]"),
    ]

    botao_confirm = None
    for by, sel in seletores_confirm:
        try:
            # Procura por elementos visíveis
            elementos = driver.find_elements(by, sel)
            for elem in elementos:
                if elem.is_displayed():
                    if elem.tag_name != "button":
                        botao_confirm = elem.find_element(By.XPATH, "./ancestor::button")
                    else:
                        botao_confirm = elem
                    print(f"✅ Botão Confirm encontrado com: {sel}")
                    break
            if botao_confirm:
                break
        except Exception as e:
            print(f"Falhou: {sel}")

    if not botao_confirm:
        caminho_screenshot = os.path.join(PASTA_DOWNLOADS, "debug_passo8_confirm.png")
        driver.save_screenshot(caminho_screenshot)
        print(f"📸 Screenshot gravado em: {caminho_screenshot}")
        raise Exception("Não encontrei o botão Confirm")

    # 4. Clica no botão Confirm
    try:
        botao_confirm.click()
    except Exception:
        print("Clique nativo no Confirm bloqueado. Executando clique via JavaScript...")
        driver.execute_script("arguments[0].click();", botao_confirm)

    print("✅ Download disparado com sucesso.")
    time.sleep(5)

def encontrar_arquivo_mais_recente(tempo_limite=15):
    """
    Aguarda a conclusão do download e retorna o arquivo *HistoryData.xls
    mais recente, garantindo que ele exista e não esteja vazio.
    """
    print("📄 Aguardando o download do arquivo ser concluído...")
    tempo_inicial = time.time()
    
    while time.time() - tempo_inicial < tempo_limite:
        # Busca apenas arquivos que terminam com HistoryData.xls (ignora .crdownload temporários)
        arquivos = glob.glob(os.path.join(PASTA_DOWNLOADS, "*HistoryData.xls"))
        
        if arquivos:
            mais_recente = max(arquivos, key=os.path.getmtime)
            tamanho = os.path.getsize(mais_recente)
            
            # Garante que o arquivo já foi totalmente salvo no disco (tamanho > 0 bytes)
            if tamanho > 0:
                print(f"✅ Arquivo localizado com sucesso: {mais_recente} ({tamanho} bytes)")
                return mais_recente
                
        time.sleep(1)  # Aguarda 1 segundo antes de checar novamente

    # Se atingir o tempo limite sem encontrar um arquivo válido:
    arquivos_na_pasta = os.listdir(PASTA_DOWNLOADS)
    raise FileNotFoundError(
        f"❌ Nenhum arquivo *HistoryData.xls válido/completo foi encontrado após {tempo_limite}s.\n"
        f"Conteúdo atual da pasta '{PASTA_DOWNLOADS}': {arquivos_na_pasta}"
    )

def passo9_apagar_colunas(df):
    existentes = [c for c in COLUNAS_APAGAR if c in df.columns]
    nao_encontradas = [c for c in COLUNAS_APAGAR if c not in df.columns]
    df = df.drop(columns=existentes)
    print(f"Passo 9: {len(existentes)} colunas apagadas")
    if nao_encontradas:
        print(f"Não encontradas (ignoradas): {nao_encontradas}")
    return df

def passo10_renomear_colunas(df):
    # 1. Normalização prévia do cabeçalho
    df.columns = (
        df.columns
        .str.replace('（', '(', regex=False)
        .str.replace('）', ')', regex=False)
        .str.replace(' ', '')  # Remove espaços extras internos (como do '风速（ m/s）')
        .str.strip()
    )
    
    # 2. Renomeia usando o dicionário atualizado
    renomear = {k: v for k, v in COLUNAS_RENOMEAR.items() if k in df.columns}
    df = df.rename(columns=renomear)
    
    print(f"Passo 10: {len(renomear)} colunas renomeadas para o padrão do Django")
    return df

def mapear_colunas_para_django(df):
    """
    Mapeia os nomes das colunas originais/limpas para os nomes 
    exatos definidos no Model / Serializer do Django.
    """
    mapa_colunas = {
        # Poluentes
        'PM2.5': 'pm25',
        'PM2.5(ug/m3)': 'pm25',
        'PM10': 'pm10',
        'PM10(ug/m3)': 'pm10',
        'CO': 'co',
        'CO(mg/m3)': 'co',
        'SO2': 'so2',
        'SO2(ug/m3)': 'so2',
        'NO2': 'no2',
        'NO2(ug/m3)': 'no2',
        'O3': 'o3',
        'O3(ug/m3)': 'o3',

        # Meteorologia (Variações com e sem unidades)
        'Temperatura': 'temperatura',
        'Temperatura(℃)': 'temperatura',
        'Temperatura(°C)': 'temperatura',
        'Temperatura (°C)': 'temperatura',

        'Umidade': 'umidade',
        'Umidade(%RH)': 'umidade',
        'Umidade (%RH)': 'umidade',

        'Pressão Barométrica(hPa)': 'pressao_atmosferica',
        'Pressão Barométrica (hPa)': 'pressao_atmosferica',
        'Pressão atmosférica(hPa)': 'pressao_atmosferica',
        '气压(hPa)': 'pressao_atmosferica',

        'Velocidade do Vento(m/s)': 'velocidade_vento',
        'Velocidade do Vento (m/s)': 'velocidade_vento',
        '风速(m/s)': 'velocidade_vento',

        'Direção do Vento(°)': 'direcao_vento',
        'Direção do Vento (°)': 'direcao_vento',
        '风向(°)': 'direcao_vento',
    }
    
    # Filtra apenas o mapeamento que realmente se aplica ao DataFrame atual
    colunas_presentes = {k: v for k, v in mapa_colunas.items() if k in df.columns}
    
    return df.rename(columns=colunas_presentes)


def preparar_tempo(df):
    col_tempo = None
    for candidato in ["MonitoringTime", "Time", "DateTime", "Timestamp", "date"]:
        if candidato in df.columns:
            col_tempo = candidato
            break
    if col_tempo is None:
        col_tempo = df.columns[0]
        print(f"Coluna de tempo não encontrada, usando: '{col_tempo}'")
    df[col_tempo] = pd.to_datetime(df[col_tempo])
    df = df.sort_values(col_tempo).reset_index(drop=True)
    print(f"Coluna de tempo: '{col_tempo}'")
    return df, col_tempo

def passo11_media_horaria(df, col_tempo):
    df_h = df.copy()
    df_h["Hora"] = df_h[col_tempo].dt.floor("h")
    colunas_numericas = df_h.select_dtypes(include="number").columns.tolist()
    resultado = df_h.groupby("Hora").agg(
        **{col: (col, "mean") for col in colunas_numericas},
        **{"Qtd medicao": (col_tempo, "count")}
    ).reset_index()
    resultado.rename(columns={"Hora": col_tempo}, inplace=True)
    cols_num = resultado.select_dtypes(include="number").columns
    resultado[cols_num] = resultado[cols_num].round(4)
    print(f"Média horária gerada: {len(resultado)} linhas")
    return resultado

def passo12_media_diaria(df, col_tempo):
    df_d = df.copy()
    df_d["Data"] = df_d[col_tempo].dt.date
    colunas_numericas = df_d.select_dtypes(include="number").columns.tolist()
    resultado = df_d.groupby("Data").agg(
        **{col: (col, "mean") for col in colunas_numericas},
        **{"Qtd medicao": (col_tempo, "count")}
    ).reset_index()
    resultado.rename(columns={"Data": col_tempo}, inplace=True)
    cols_num = resultado.select_dtypes(include="number").columns
    resultado[cols_num] = resultado[cols_num].round(4)
    print(f"Média diária gerada: {len(resultado)} linhas")
    return resultado

def processar_e_salvar_drive():
    # 1. Encontra e lê o arquivo baixado
    caminho = encontrar_arquivo_mais_recente()
    if not caminho or not os.path.exists(caminho):
        print("⚠️ Operação abortada: nenhum arquivo válido encontrado.")
        return

    try:
        df = pd.read_excel(caminho)
    except Exception:
        try:
            df = pd.read_csv(caminho, sep=r'\s+', engine='python')
        except Exception as e_leitura:
            print(f"❌ Erro ao ler o arquivo {caminho}: {e_leitura}")
            return

    # Proteção contra arquivo sem dados
    if df.empty:
        print("⚠️ O arquivo importado não contém dados (DataFrame vazio). Operação encerrada.")
        return

    # =========================================================================
    # ALTERAÇÃO AQUI: TRATAMENTO DE COLUNAS E CARACTERES CHINESES
    # =========================================================================
    # 2. Limpa e renomeia as colunas
    df = passo9_apagar_colunas(df)
    df = passo10_renomear_colunas(df)

    # Remove qualquer parêntese chinês remanescente e remove espaços nas pontas
    df.columns = df.columns.str.replace('（', '(').str.replace('）', ')').str.strip()

    df, col_tempo = preparar_tempo(df)

    # Validação da coluna de tempo após o tratamento
    if col_tempo not in df.columns or df.empty:
        print(f"⚠️ Coluna de tempo '{col_tempo}' não foi localizada ou os dados são insuficientes.")
        return

    # 3. Criação dos conjuntos de dados
    df_bruto = df.copy().round(4) 
    df_horario = passo11_media_horaria(df, col_tempo)
    df_diario  = passo12_media_diaria(df, col_tempo)

    # Proteção adicional se o resample retornar vazio
    if df_horario.empty or df_diario.empty:
        print("⚠️ Falha ao calcular médias horárias/diárias (dados insuficientes).")
        return

    # 4. Verifica se há dados incompletos
    aviso = verificar_medicoes_incompletas(df_horario, df_diario, col_tempo)

    # 5. Prepara as variáveis para a API trocando o nome para timestamp
    df_bruto_api = df_bruto.rename(columns={col_tempo: 'timestamp'})
    df_horario_api = df_horario.rename(columns={col_tempo: 'timestamp'})
    df_diario_api = df_diario.rename(columns={col_tempo: 'timestamp'})

    # Endereço do site no Render. Para testar no Django local, defina antes no terminal:
    #   $env:DJANGO_API_URL = "http://127.0.0.1:8000/api/painel/"
    DJANGO_API_URL = os.getenv("DJANGO_API_URL") or "https://iqa-lab.onrender.com/api/painel/"

    # Envia os 3 pacotes de dados
    for tipo, dataframe in [('bruto', df_bruto_api), ('horario', df_horario_api), ('diario', df_diario_api)]:

        df_temp = dataframe.copy()

        # Converte para datetime e formata em string ISO
        df_temp['timestamp'] = pd.to_datetime(df_temp['timestamp'])
        df_temp['timestamp'] = df_temp['timestamp'].dt.strftime('%Y-%m-%dT%H:%M:%S')

        # Sanitização de NaN e Inf para o JSON do Django
        df_temp = df_temp.replace([np.inf, -np.inf], np.nan)
        dados_dict = df_temp.astype(object).where(pd.notnull(df_temp), None).to_dict(orient="records")

        payload_json = json.dumps({"tipo": tipo, "dados": dados_dict})

        # O Render gratuito pode estar "dormindo" (até ~1 min para acordar):
        # timeout longo e até 3 tentativas
        for tentativa in range(1, 4):
            try:
                resposta = requests.post(
                    DJANGO_API_URL,
                    data=payload_json,
                    headers={'Content-Type': 'application/json'},
                    timeout=120
                )
                if resposta.status_code == 200:
                    print(f"✅ '{tipo}' enviado para {DJANGO_API_URL}: {resposta.json().get('mensagem')}")
                    break
                print(f"❌ Erro ao enviar '{tipo}' (tentativa {tentativa}/3): {resposta.status_code} {resposta.text[:300]}")
            except Exception as e:
                print(f"❌ Falha de conexão ao enviar '{tipo}' (tentativa {tentativa}/3): {e}")
            if tentativa < 3:
                time.sleep(20)

    # 6. Salva os arquivos locais temporários
    caminhos_locais = {
        NOMES_ARQUIVOS_DRIVE["bruto"]: os.path.join(PASTA_DOWNLOADS, NOMES_ARQUIVOS_DRIVE["bruto"]),
        NOMES_ARQUIVOS_DRIVE["horario"]: os.path.join(PASTA_DOWNLOADS, NOMES_ARQUIVOS_DRIVE["horario"]),
        NOMES_ARQUIVOS_DRIVE["diario"]: os.path.join(PASTA_DOWNLOADS, NOMES_ARQUIVOS_DRIVE["diario"])
    }

    df_bruto.to_excel(caminhos_locais[NOMES_ARQUIVOS_DRIVE["bruto"]], index=False)
    df_horario.to_excel(caminhos_locais[NOMES_ARQUIVOS_DRIVE["horario"]], index=False)
    df_diario.to_excel(caminhos_locais[NOMES_ARQUIVOS_DRIVE["diario"]], index=False)

    # 7. Envia o e-mail APENAS se houver algum aviso/falha nas medições
    if aviso:
        print("✉️ Medições incompletas detectadas. Enviando e-mail de alerta...")
        enviar_relatorios_por_email(caminhos_locais, aviso)
    else:
        print("ℹ️ Envio de e-mail omitido (todas as medições estão completas).")

    # 8. Limpa os arquivos temporários gerados APÓS o envio do e-mail
    for cam in caminhos_locais.values():
        if os.path.exists(cam):
            try:
                os.remove(cam)
            except Exception:
                pass
            
def criar_driver():
    from selenium import webdriver
    from selenium.webdriver.edge.service import Service as EdgeService
    from selenium.webdriver.edge.options import Options as EdgeOptions

    options = EdgeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")

    # Mudar a estratégia de carregamento para 'eager' (interativo)
    options.page_load_strategy = 'eager'

    # Configuração de download nativa
    prefs = {
        "download.default_directory": PASTA_DOWNLOADS,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    options.add_experimental_option("prefs", prefs)

    # 1. Defina o caminho do driver do Edge salvo localmente (evita o WinError 4551)
    caminho_edgedriver = r"C:\Users\helen\OneDrive\MS800A_Air_Quality_Monitoring_System\plataforma_qualidade_do_ar\msedgedriver.exe"
    service = EdgeService(executable_path=caminho_edgedriver)

    # 2. Instancie o Edge em vez do Chrome
    driver = webdriver.Edge(service=service, options=options)
    
    # Timeouts e esperas
    driver.set_page_load_timeout(60)
    driver.implicitly_wait(10)

    return driver


def main():
    driver = None
    
    # -------------------------------------------------------------
    # PARTE 1: NAVEGAÇÃO E EXPORTAÇÃO COM SELENIUM
    # -------------------------------------------------------------
    try:
        driver = criar_driver()
        wait = WebDriverWait(driver, 40)

        if not fazer_login(driver, wait):
            print("⚠️ Falha ao realizar login. Interrompendo este ciclo.")
            return

        time.sleep(2)
        passo1_abrir_menu(driver, wait)
        passo1_5_garantir_sidebar_aberta(driver, wait)
        passo2_navegar_history_data(driver, wait)
        passo3_selecionar_site(driver, wait)
        passo4_selecionar_contaminant(driver, wait)
        passo5_selecionar_intervalo(driver, wait)
        passo6_preencher_datas(driver, wait)
        passo7_pesquisar(driver, wait)
        passo8_exportar(driver, wait)

    except Exception as e:
        print("\n❌ ERRO DETECTADO DURANTE A RASPAGEM (SELENIUM):")
        print("--------------------------------------------------")
        traceback.print_exc()  # Exibe o número exato da linha e a função que falhou
        print("--------------------------------------------------")
        raise e

    finally:
        # Encerramento OBRIGATÓRIO e blindado da instância do Selenium
        if driver:
            try:
                driver.quit()
                print("🔒 Instância do Chrome/Selenium encerrada com sucesso.")
            except Exception:
                pass

    # -------------------------------------------------------------
    # PARTE 2: LEITURA DO ARQUIVO, TRATAMENTO E POST NO DJANGO
    # -------------------------------------------------------------
    try:
        processar_e_salvar_drive()
    except Exception as e:
        print("\n❌ ERRO DETECTADO DURANTE O PROCESSAMENTO/POST:")
        print("--------------------------------------------------")
        traceback.print_exc()  # Exibe o número exato da linha do tratamento de dados
        print("--------------------------------------------------")
        raise e

def limpar_processos_chromedriver():
    """
    Força o encerramento de instâncias presas do ChromeDriver e do Chrome
    no Windows para liberar portas de comunicação HTTP do Selenium.
    """
    try:
        os.system("taskkill /F /IM chromedriver.exe /T >nul 2>&1")
        os.system("taskkill /F /IM chrome.exe /T >nul 2>&1")
    except Exception:
        pass

from datetime import datetime, timedelta
import time

def executar_coleta():
    print(f"\n==================================================")
    print(f"⏰ [DISPARO AUTOMÁTICO] {time.strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"==================================================")
    
    try:
        # 1. Garante ambiente limpo antes de abrir o navegador
        limpar_processos_chromedriver()

        # 2. Chama a função principal de raspagem e envio dos dados ao Django
        main() 
        print("✅ Ciclo de coleta finalizado com sucesso!")

    except Exception as e:
        print(f"❌ ERRO durante a execução do robô: {e}")

    finally:
        # 3. Limpa processos em segundo plano
        limpar_processos_chromedriver()

# -------------------------------------------------------------
    # CÁLCULO INFALÍVEL DO PRÓXIMO DISPARO (1 HORA À FRENTE NO MINUTO :04)
    # -------------------------------------------------------------
    agora = datetime.now()
    
    # Adiciona 1 hora ao horário de término e fixa o minuto em 04:00
    proximo_disparo = (agora + timedelta(hours=1)).replace(minute=4, second=0, microsecond=0)

    print(f"\n⏳ Ciclo finalizado! Próxima coleta agendada para: {proximo_disparo.strftime('%d/%m/%Y às %H:%M:%S')}")
    print("-----------------------------------------------------------------------------------------")

if __name__ == "__main__":
    print("\n🚀 [INICIALIZAÇÃO] Robô de Coleta de Qualidade do Ar")
    print("--------------------------------------------------")
    
# 1. Configura o agendamento
    schedule.every().hour.at(":04").do(executar_coleta)

    # 2. Executa a primeira coleta de arranque/teste
    print("🔄 Executando primeira coleta de arranque...")
    executar_coleta()

    # 3. Calcula e exibe o próximo disparo real cravado no horário de Brasília
    agora = datetime.now(ZoneInfo("America/Sao_Paulo"))
    if agora.minute >= 4:
        proximo_disparo = (agora + timedelta(hours=1)).replace(minute=4, second=0, microsecond=0)
    else:
        proximo_disparo = agora.replace(minute=4, second=0, microsecond=0)

    print(f"\n⏳ Agendador ativo! Próxima coleta agendada para: {proximo_disparo.strftime('%d/%m/%Y às %H:%M:%S')}")
    print("👉 Mantenha esta janela do terminal ABERTA para a automação funcionar.\n")

    # 4. Loop infinito de verificação otimizado
    while True:
        try:
            schedule.run_pending()
            time.sleep(1)  # Evita consumo excessivo de CPU e alinha as checagens por segundo
        except Exception as err_loop:
            print(f"⚠️ Alerta no loop do agendador: {err_loop}")
