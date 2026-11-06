from datetime import timedelta
from django.db import models

class MedicaoSensor(models.Model):
    TIPO_CHOICES = [
        ('bruto', 'Dado Bruto (1 Minuto)'),
        ('horario', 'Média Horária'),
        ('diario', 'Média Diária'),
    ]

    timestamp = models.DateTimeField()
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    
    # Campos meteorológicos (já existentes)
    temperatura = models.FloatField(null=True, blank=True)
    umidade = models.FloatField(null=True, blank=True)
    pressao_atmosferica = models.FloatField(null=True, blank=True)
    velocidade_vento = models.FloatField(null=True, blank=True)
    direcao_vento = models.FloatField(null=True, blank=True)
    pm25 = models.FloatField(null=True, blank=True, verbose_name="PM2.5 (µg/m³)")
    pm10 = models.FloatField(null=True, blank=True, verbose_name="PM10 (µg/m³)")
    co = models.FloatField(null=True, blank=True, verbose_name="CO (ppm)")
    so2 = models.FloatField(null=True, blank=True, verbose_name="SO2 (µg/m³)")
    no2 = models.FloatField(null=True, blank=True, verbose_name="NO2 (µg/m³)")
    o3 = models.FloatField(null=True, blank=True, verbose_name="O3 (µg/m³)")

    @property
    def timestamp_fim_intervalo(self):
        """Retorna o timestamp + 1 hora apenas para médias horárias."""
        if self.timestamp:
            if self.tipo == 'horario':
                return self.timestamp + timedelta(hours=1)
            return self.timestamp
        return None

    
    # Controle de qualidade para as médias
    qtd_medicao = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']
        unique_together = ('timestamp', 'tipo')

    def __str__(self):
        return f"[{self.get_tipo_display()}] {self.timestamp}"
