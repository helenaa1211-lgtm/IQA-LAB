import os
import glob
import pandas as pd
from django.core.management.base import BaseCommand
from django.utils import timezone
from sensores.models import MedicaoSensor

PASTA_DOWNLOADS = os.path.abspath("./downloads")

class Command(BaseCommand):
    help = 'Processa os dados baixados e atualiza o Banco de Dados'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING('Iniciando integração de dados no banco...'))

        arquivos = glob.glob(os.path.join(PASTA_DOWNLOADS, "dados_tratados.csv"))
        if not arquivos:
            self.stdout.write(self.style.ERROR('Nenhum arquivo tratado foi encontrado.'))
            return

        df = pd.read_csv(arquivos[0])
        registros_salvos = 0

        # Substitui NaN e Inf por None do Python para compatibilidade com o Django
        df = df.replace([pd.NA, float('inf'), float('-inf')], None)

        for _, row in df.iterrows():
            # Tenta pegar 'timestamp' primeiro (padrão do robô); se não achar, tenta 'data_hora'
            coluna_data = row.get('timestamp') if 'timestamp' in row else row.get('data_hora')
            
            if pd.isna(coluna_data) or coluna_data is None:
                continue

            # Converte e trata o timestamp
            dt = pd.to_datetime(coluna_data)
            timestamp_utc = timezone.make_aware(dt, timezone.utc) if timezone.is_naive(dt) else dt

            # Função auxiliar para garantir retorno de None em vez de NaN
            def get_val(campo):
                val = row.get(campo)
                return None if pd.isna(val) else val

            # Prepara a medição
            nova_medicao = MedicaoSensor(
                timestamp=timestamp_utc,
                tipo='bruto',
                pm25=get_val('pm25'),
                pm10=get_val('pm10'),
                co=get_val('co'),
                so2=get_val('so2'),        # <-- SO2 tratado
                no2=get_val('no2'),        # <-- NO2 tratado
                o3=get_val('o3'),
                temperatura=get_val('temperatura'),
                umidade=get_val('umidade')
            )

            # Evita duplicatas antes de gravar
            if not MedicaoSensor.objects.filter(timestamp=nova_medicao.timestamp, tipo='bruto').exists():
                nova_medicao.save()
                registros_salvos += 1

        self.stdout.write(self.style.SUCCESS(f'Sucesso! {registros_salvos} novos registros inseridos.'))
