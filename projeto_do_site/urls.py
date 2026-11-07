"""
URL configuration for projeto_do_site project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
import os
import sys

# Descobre onde está a raiz do seu projeto e avisa ao Python
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from django.contrib import admin
from django.urls import path
from django.views.generic import TemplateView
from sensores.views import (
    painel_sensores,
    api_receber_dados,
    api_dados_painel,
)

urlpatterns = [
    # 1. Rota Principal: mostra o JSON do painel (igual a /api/painel/)
    path('', api_dados_painel, name='inicio'),

    # 2. App Flutter Web movido para /app/
    path('app/', TemplateView.as_view(template_name='index.html'), name='flutter_app'),

    # 3. Painel de Administração do Django
    path('admin/', admin.site.urls),

    # 4. Painel HTML antigo com Chart.js (caso queira acessar diretamente)
    path('painel-antigo/', painel_sensores, name='painel_sensores'),

    # 5. Endpoints de API REST
    path('api/dados/', api_receber_dados, name='api_dados'),
    path('api/painel/', api_dados_painel, name='api_dados_painel'),
]