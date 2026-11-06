import os
import time
import glob
import logging
import pandas as pd
from celery import Celery
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions

# Configuração do Celery (assumindo Redis rodando em localhost:6379)
app = Celery(
    'automação_scraping',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

PASTA_DOWNLOADS = os.path.abspath("./downloads")
os.makedirs(PASTA_DOWNLOADS, exist_ok=True)

# Configurações de logs para acompanhar a task
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==========================================
# DRIVER & HELPERS
# ==========================================

def criar_driver():
    options = ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")

    prefs = {
        "download.default_directory": PASTA_DOWNLOADS,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(options=options)
    
    driver.execute_cdp_cmd("Page.setDownloadBehavior", {
        "behavior": "allow",
        "downloadPath": PASTA_DOWNLOADS
    })
    return driver

# ==========================================
# PASSO A PASSO DO ROBÔ
# ==========================================

def fazer_login(driver, wait):
    driver.get("https://exemplo-portal.com/login")
    wait.until(EC.element_to_be_clickable((By.ID, "username"))).send_keys("seu_usuario")
    driver.find_element(By.ID, "password").send_keys("sua_senha")
    driver.find_element(By.ID, "btn-login").click()
    return True

def passo1_abrir_menu(driver, wait):
    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()

def passo1_5_garantir_sidebar_aberta(driver, wait):
    wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".sidebar-open")))

def passo2_navegar_history_data(driver, wait):
    wait.until(EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'History Data')]"))).click()

def passo3_selecionar_site(driver, wait):
    wait.until(EC.element_to_be_clickable((By.ID, "select-site"))).click()
    wait.until(EC.element_to_be_clickable((By.XPATH, "//option[@value='site_1']"))).click()

def passo4_selecionar_contaminant(driver, wait):
    wait.until(EC.element_to_be_clickable((By.ID, "select-contaminant"))).click()
    wait.until(EC.element_to_be_clickable((By.XPATH, "//option[@value='all']"))).click()

def passo5_selecionar_intervalo(driver, wait):
    wait.until(EC.element_to_be_clickable((By.ID, "interval-daily"))).click()

def passo6_preencher_datas(driver, wait, data_inicio, data_fim):
    campo_inicio = wait.until(EC.presence_of_element_located((By.ID, "start-date")))
    campo_fim = driver.find_element(By.ID, "end-date")
    
    campo_inicio.clear()
    campo_inicio.send_keys(data_inicio)
    campo_fim.clear()
    campo_fim.send_keys(data_fim)

def passo7_pesquisar(driver, wait):
    wait.until(EC.element_to_be_clickable((By.ID, "btn-search"))).click()
    time.sleep(3)

def passo8_exportar(driver, wait):
    wait.until(EC.element_to_be_clickable((By.ID, "btn-export-excel"))).click()
    time.sleep(5)

# ==========================================
# PROCESSAMENTO DOS DADOS
# ==========================================

def processar_e_salvar_drive():
    arquivos = glob.glob(os.path.join(PASTA_DOWNLOADS, "*.xlsx")) + glob.glob(os.path.join(PASTA_DOWNLOADS, "*.csv"))
    if not arquivos:
        raise FileNotFoundError("Nenhum arquivo baixado foi encontrado para processamento.")

    mais_recente = max(arquivos, key=os.path.getctime)
    logger.info(f"Processando arquivo: {mais_recente}")

    if mais_recente.endswith('.csv'):
        df = pd.read_csv(mais_recente)
    else:
        df = pd.read_excel(mais_recente)

    df.dropna(how='all', inplace=True)
    
    caminho_final = os.path.join(PASTA_DOWNLOADS, "dados_tratados.csv")
    df.to_csv(caminho_final, index=False)
    logger.info(f"Arquivo final gerado em: {caminho_final}")
    return caminho_final

# ==========================================
# DECORADOR CELERY TASK
# ==========================================

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def executar_scraping_task(self, data_inicio="2026-01-01", data_fim="2026-08-28"):
    """
    Task do Celery responsável por executar a automação completa do robô.
    Possui retentativa automática (max_retries=3) em caso de exceção.
    """
    logger.info(f"Iniciando Task {self.request.id} com datas: {data_inicio} até {data_fim}")
    driver = None
    try:
        driver = criar_driver()
        wait = WebDriverWait(driver, 40)

        if not fazer_login(driver, wait):
            raise Exception("Falha ao realizar login.")

        time.sleep(2)
        passo1_abrir_menu(driver, wait)
        passo1_5_garantir_sidebar_aberta(driver, wait)
        passo2_navegar_history_data(driver, wait)
        passo3_selecionar_site(driver, wait)
        passo4_selecionar_contaminant(driver, wait)
        passo5_selecionar_intervalo(driver, wait)
        passo6_preencher_datas(driver, wait, data_inicio, data_fim)
        passo7_pesquisar(driver, wait)
        passo8_exportar(driver, wait)

        caminho_arquivo = processar_e_salvar_drive()
        return {"status": "SUCESSO", "arquivo": caminho_arquivo}

    except Exception as exc:
        logger.error(f"Erro durante a execução da task: {exc}")
        # Tenta reexecutar a task após o delay definido se falhar
        raise self.retry(exc=exc)

    finally:
        if driver:
            driver.quit()
