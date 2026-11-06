# meu_projeto/celery.py
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'meu_projeto.settings')

app = Celery('meu_projeto')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
