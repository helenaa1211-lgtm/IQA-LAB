import json
import math
import pandas as pd
from datetime import timedelta
from dateutil import parser
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import MedicaoSensor
from .utils import calcular_iqa_global


def limpar_valor(item, chaves):
    for chave in chaves:
        if chave in item:
            val = item[chave]
            if val is None or pd.isna(val) or val == '':
                continue
            try:
                val_float = float(val)
                if math.isnan(val_float):
                    return None
                return val_float
            except (ValueError, TypeError):
                continue
    return None


@csrf_exempt
def receber_dados_sensor(request):
    # LEITURA DOS DADOS (GET)
    if request.method == 'GET':
        tipo = request.GET.get('tipo', 'horario')
        limite_param = request.GET.get('limite', '100')

        try:
            limite = int(limite_param)
        except (ValueError, TypeError):
            limite = 100

        medicoes = MedicaoSensor.objects.filter(tipo=tipo).order_by('-timestamp')[:limite]

        # 1. IQA Global oficial em tempo real (Médias Móveis de 24h, 8h, 1h) para os cards de topo
        iqa_global_atual = calcular_iqa_global()

        dados_resposta = []
        for m in medicoes:
            ts_local = timezone.localtime(m.timestamp)
            
            # Se for média horária, soma +1 hora para representar o fim do intervalo
            if m.tipo == 'horario' and ts_local:
                ts_local = ts_local + timedelta(hours=1)

            # Extrai os poluentes específicos deste registro do histórico
            medicoes_ponto = {
                'pm25': m.pm25,
                'pm10': m.pm10,
                'co': m.co,
                'so2': m.so2,
                'no2': m.no2,
                'o3': m.o3
            }

            # 2. Calcula o IQA dinâmico do ponto histórico para permitir a variação no gráfico
            iqa_ponto = calcular_iqa_global(medicoes=medicoes_ponto)

            dados_resposta.append({
                'id': m.id,
                'timestamp': ts_local.isoformat() if ts_local else None,
                'tipo': m.tipo,
                'pm25': m.pm25,
                'pm10': m.pm10,
                'co': m.co,
                'so2': m.so2,
                'no2': m.no2,
                'o3': m.o3,
                'temperatura': m.temperatura,
                'umidade': m.umidade,
                'pressao_atmosferica': m.pressao_atmosferica,
                'velocidade_vento': m.velocidade_vento,
                'direcao_vento': m.direcao_vento,
                'qtd_medicao': m.qtd_medicao,

                # Dados do IQA dinâmicos do ponto (variam hora a hora no gráfico)
                'iqa': iqa_ponto['iqa'] if iqa_ponto else None,
                'qualidade': iqa_ponto['qualidade'] if iqa_ponto else None,
                'nivel_saude': iqa_ponto['nivel_saude'] if iqa_ponto else None,
                'poluente_determinante': iqa_ponto['poluente_determinante'] if iqa_ponto else None,
                'cor': iqa_ponto['cor'] if iqa_ponto else None,
            })

        return JsonResponse({
            'status': 'sucesso',
            'iqa_resumo': iqa_global_atual,  # Alimenta o card/resumo geral no topo do app
            'dados': dados_resposta          # Alimenta a lista histórica e o gráfico
        }, status=200)

    # RECEBIMENTO DE DADOS DO ROBÔ / SENSOR (POST)
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            tipo = body.get('tipo', 'bruto')
            lista_dados = body.get('dados', [])

            if not isinstance(lista_dados, list):
                return JsonResponse({'status': 'erro', 'mensagem': 'Payload inválido.'}, status=400)

            registros_processados = 0

            for item in lista_dados:
                timestamp_str = item.get('timestamp') or item.get('Data/Hora') or item.get('Tempo') or item.get('data_hora')
                if not timestamp_str:
                    continue

                dt_obj = parser.parse(str(timestamp_str))
                if timezone.is_naive(dt_obj):
                    dt_obj = timezone.make_aware(dt_obj)

                valores_medicao = {
                    'temperatura': limpar_valor(item, ['Temperatura (°C)', 'Temperatura', 'temperatura', 'Temp']),
                    'umidade': limpar_valor(item, ['Umidade (%RH)', 'Umidade', 'umidade', 'RH']),
                    'pressao_atmosferica': limpar_valor(item, ['Pressão atmosférica (hPa)', 'Pressao', 'Pressão', 'pressao_atmosferica']),
                    'velocidade_vento': limpar_valor(item, ['Vento (m/s)', 'Velocidade do vento (m/s)', 'Vento', 'velocidade_vento']),
                    'direcao_vento': limpar_valor(item, ['Direção do vento (°)', 'Direcao do vento', 'Direção', 'direcao_vento']),
                    'pm25': limpar_valor(item, ['PM2.5（ug/m3）', 'PM2.5(ug/m3)', 'PM2.5', 'pm25', 'PM25']),
                    'pm10': limpar_valor(item, ['PM10（ug/m3）', 'PM10(ug/m3)', 'PM10', 'pm10']),
                    'co': limpar_valor(item, ['CO（mg/m3）', 'CO(mg/m3)', 'CO', 'co']),
                    'so2': limpar_valor(item, ['SO2（ug/m3）', 'SO2(ug/m3)', 'SO2', 'so2']),
                    'no2': limpar_valor(item, ['NO2（ug/m3）', 'NO2(ug/m3)', 'NO2', 'no2']),
                    'o3': limpar_valor(item, ['O3（ug/m3）', 'O3(ug/m3)', 'O3', 'o3']),
                    'qtd_medicao': limpar_valor(item, ['Qtd medicao', 'Quantidade', 'qtd_medicao'])
                }

                # Salva ou atualiza a leitura de entrada no banco de dados
                MedicaoSensor.objects.update_or_create(
                    timestamp=dt_obj,
                    tipo=tipo,
                    defaults=valores_medicao
                )
                registros_processados += 1

            return JsonResponse({
                'status': 'sucesso',
                'mensagem': f'{registros_processados} registros de "{tipo}" salvos/atualizados!'
            }, status=200)

        except Exception as e:
            return JsonResponse({'status': 'erro', 'mensagem': str(e)}, status=500)

    return JsonResponse({'status': 'erro', 'mensagem': 'Método não permitido.'}, status=405)


def painel_sensores(request):
    return JsonResponse({
        "status": "sucesso",
        "mensagem": "Servidor rodando. Utilize a API em /api/painel/?tipo=horario"
    })


api_receber_dados = receber_dados_sensor
api_dados_painel = receber_dados_sensor
