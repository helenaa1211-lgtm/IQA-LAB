from rest_framework import serializers
from datetime import timedelta
from .models import MedicaoSensor

class MedicaoSensorSerializer(serializers.ModelSerializer):
    timestamp = serializers.SerializerMethodField()

    class Meta:
        model = MedicaoSensor
        fields = [
            'id', 
            'timestamp', 
            'tipo', 
            'pm25', 
            'pm10', 
            'co', 
            'so2', 
            'no2', 
            'o3', 
            'temperatura', 
            'umidade', 
            'velocidade_vento',
            'direcao_vento'
        ]

    def get_timestamp(self, obj):
        # Se for média horária, adiciona 1 hora na resposta da API
        if obj.timestamp and obj.tipo == 'horario':
            return (obj.timestamp + timedelta(hours=1)).isoformat()
        return obj.timestamp.isoformat() if obj.timestamp else None


class MedicaoSensorGraphSerializer(serializers.ModelSerializer):
    hora = serializers.SerializerMethodField()
    timestamp = serializers.SerializerMethodField()

    class Meta:
        model = MedicaoSensor
        fields = [
            'hora', 
            'timestamp', 
            'pm25', 
            'pm10', 
            'co', 
            'so2', 
            'no2', 
            'o3', 
            'temperatura', 
            'umidade', 
            'velocidade_vento', 
            'direcao_vento'
        ]

    def get_timestamp(self, obj):
        if obj.timestamp and obj.tipo == 'horario':
            return (obj.timestamp + timedelta(hours=1)).isoformat()
        return obj.timestamp.isoformat() if obj.timestamp else None

    def get_hora(self, obj):
        if obj.timestamp and obj.tipo == 'horario':
            return (obj.timestamp + timedelta(hours=1)).strftime('%H:%M')
        return obj.timestamp.strftime('%H:%M') if obj.timestamp else ""
