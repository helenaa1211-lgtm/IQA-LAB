from datetime import timedelta
from django.utils import timezone
from django.db.models import Avg
from .models import MedicaoSensor

# 1. Tabela de Faixas Oficial CONAMA 506/2024 no escopo global
TABELAS = {
    'pm25': [
        (0.0, 15.0, 0, 40),      # N1 - Boa
        (15.0, 50.0, 41, 80),    # N2 - Moderada
        (50.0, 75.0, 81, 120),   # N3 - Ruim
        (75.0, 125.0, 121, 200), # N4 - Muito Ruim
        (125.0, 300.0, 201, 400) # N5 - Péssima
    ],
    'pm10': [
        (0.0, 45.0, 0, 40),
        (45.0, 100.0, 41, 80),
        (100.0, 150.0, 81, 120),
        (150.0, 250.0, 121, 200),
        (250.0, 600.0, 201, 400)
    ],
    'o3': [
        (0.0, 100.0, 0, 40),
        (100.0, 130.0, 41, 80),
        (130.0, 160.0, 81, 120),
        (160.0, 200.0, 121, 200),
        (200.0, 800.0, 201, 400)
    ],
    'no2': [
        (0.0, 200.0, 0, 40),
        (200.0, 240.0, 41, 80),
        (240.0, 320.0, 81, 120),
        (320.0, 1130.0, 121, 200),
        (1130.0, 3750.0, 201, 400)
    ],
    'so2': [
        (0.0, 40.0, 0, 40),
        (40.0, 50.0, 41, 80),
        (50.0, 125.0, 81, 120),
        (125.0, 800.0, 121, 200),
        (800.0, 2620.0, 201, 400)
    ],
    'co': [
        (0.0, 9.0, 0, 40),
        (9.0, 11.0, 41, 80),
        (11.0, 13.0, 81, 120),
        (13.0, 15.0, 121, 200),
        (15.0, 50.0, 201, 400)
    ],
}


def calcular_iqa_poluente(concentracao, tabela_faixas):
    """
    Calcula o IQA de um poluente específico por interpolação linear.
    Atende à regra: Faixa N1 inclui 0 (c_ini <= C <= c_fim)
    Faixas N2 em diante são estritamente maiores que o limite inferior (c_ini < C <= c_fim)
    """
    if concentracao is None or concentracao < 0:
        return None

    for index, (c_ini, c_fim, i_ini, i_fim) in enumerate(tabela_faixas):
        pertence_a_faixa = (c_ini <= concentracao <= c_fim) if index == 0 else (c_ini < concentracao <= c_fim)

        if pertence_a_faixa:
            iqa = i_ini + ((i_fim - i_ini) / (c_fim - c_ini)) * (concentracao - c_ini)
            return round(iqa, 2)

    # Caso a concentração ultrapasse a faixa máxima da tabela (> N5 Péssima)
    ultimo_c_fim = tabela_faixas[-1][1]
    if concentracao > ultimo_c_fim:
        return 400.0

    return None


def obter_medias_moveis_banco(estacao_id=None):
    """
    Busca as medições no banco de dados e calcula as MÉDIAS MÓVEIS
    respeitando as janelas temporais da norma CONAMA 506/2024.
    """
    agora = timezone.now()

    queryset = MedicaoSensor.objects.all()
    if estacao_id:
        queryset = queryset.filter(estacao_id=estacao_id)

    # 1. Janela de 24 horas (PM2.5, PM10, SO2)
    limite_24h = agora - timedelta(hours=24)
    medias_24h = queryset.filter(timestamp__gte=limite_24h).aggregate(
        pm25=Avg('pm25'),
        pm10=Avg('pm10'),
        so2=Avg('so2')
    )

    # 2. Janela de 8 horas (O3, CO)
    limite_8h = agora - timedelta(hours=8)
    medias_8h = queryset.filter(timestamp__gte=limite_8h).aggregate(
        o3=Avg('o3'),
        co=Avg('co')
    )

    # 3. Janela de 1 hora (NO2)
    limite_1h = agora - timedelta(hours=1)
    medias_1h = queryset.filter(timestamp__gte=limite_1h).aggregate(
        no2=Avg('no2')
    )

    return {
        'pm25': medias_24h['pm25'],
        'pm10': medias_24h['pm10'],
        'so2': medias_24h['so2'],
        'o3': medias_8h['o3'],
        'co': medias_8h['co'],
        'no2': medias_1h['no2'],
    }


def calcular_iqa_global(medicoes=None, estacao_id=None):
    """
    Calcula o IQA global considerando as faixas do CONAMA 506/2024.
    """
    if medicoes is None:
        medicoes = obter_medias_moveis_banco(estacao_id=estacao_id)

    indices_calculados = {}

    for poluente, valor in medicoes.items():
        if poluente in TABELAS and valor is not None:
            idx = calcular_iqa_poluente(valor, TABELAS[poluente])
            if idx is not None:
                indices_calculados[poluente] = idx

    if not indices_calculados:
        return None

    poluente_determinante = max(indices_calculados, key=indices_calculados.get)
    iqa_maximo = indices_calculados[poluente_determinante]

    if iqa_maximo <= 40:
        qualidade, cor, nivel_saude = "BOA", "#00E400", "Seguro à Saúde"
    elif iqa_maximo <= 80:
        qualidade, cor, nivel_saude = "MODERADA", "#FFFF00", "Tolerável"
    elif iqa_maximo <= 120:
        qualidade, cor, nivel_saude = "RUIM", "#FF7E00", "Insalubre"
    elif iqa_maximo <= 200:
        qualidade, cor, nivel_saude = "MUITO RUIM", "#FF0000", "Muito Insalubre"
    else:
        qualidade, cor, nivel_saude = "PÉSSIMA", "#8F3F97", "Perigoso"

    return {
        "iqa": iqa_maximo,
        "poluente_determinante": poluente_determinante,
        "qualidade": qualidade,
        "nivel_saude": nivel_saude,
        "cor": cor,
        "medias_moveis_utilizadas": medicoes,
        "iqa_por_poluente": indices_calculados
    }
