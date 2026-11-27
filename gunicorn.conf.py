# Lu automatiquement par `gunicorn serve:app` (fichier ./gunicorn.conf.py) : rien à changer sur Render.
# Render gratuit = 512 Mo : un seul processus (chaque worker recharge toutes les données en mémoire).
workers = 1
# 2 threads : la page reste servie pendant un calcul de /pool_advice_api, sans doubler les pics mémoire
worker_class = "gthread"
threads = 2
# le recalcul des pools conseillés peut dépasser les 30 s par défaut sur le CPU de Render
timeout = 120
# redémarre le worker de temps en temps (limite la fragmentation mémoire)
max_requests = 1000
max_requests_jitter = 100
