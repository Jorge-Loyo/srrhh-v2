FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

# En local se usa 5001; en Render (u otro PaaS) la plataforma inyecta $PORT y
# espera que el servicio escuche ahí. Se usa la forma shell del CMD para que
# ${PORT} se expanda; si no está definida, cae a 5001 (local/Docker directo).
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}
