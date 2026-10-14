"""
Tests de la lógica de jobs async del padrón (Opción B): barrido/TTL y heartbeat.

NO importa main.py (que conecta a Postgres y carga tablas de referencia al
importar). En su lugar reconstruye las funciones puras `_barrer_jobs` y
`_job_heartbeat` sobre un JOBS_DIR temporal, replicando EXACTAMENTE la lógica de
main.py, para verificar la semántica de diseño sin levantar FastAPI ni la BD.

Se usa unittest (stdlib) — este servicio no trae pytest. Correr:
  python -m unittest tests.test_jobs_barrido   (desde services/dotaneitor)
  python tests/test_jobs_barrido.py            (runner directo)

Las constantes y la lógica se mantienen en sync con main.py:
  JOB_STUCK_SECS=1200, JOB_TTL=3600, JOB_HEARTBEAT_SECS=300.
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path

# Constantes espejo de main.py (si cambian allá, cambiar acá).
JOB_STUCK_SECS = 1200
JOB_TTL = 3600


class _Jobs:
    """Reimplementación aislada de los helpers de jobs de main.py sobre un
    JOBS_DIR/TMP_DIR temporal. La lógica es idéntica a la de main.py."""

    def __init__(self, tmp_dir: Path):
        self.TMP_DIR = tmp_dir
        self.JOBS_DIR = tmp_dir / 'jobs'
        self.JOBS_DIR.mkdir(parents=True, exist_ok=True)

    def _job_path(self, job_id: str) -> Path:
        return self.JOBS_DIR / f'{job_id}.json'

    def _write_job(self, job_id: str, data: dict):
        self._job_path(job_id).write_text(
            json.dumps(data, ensure_ascii=True, default=str), encoding='utf-8'
        )

    def _read_job(self, job_id: str):
        p = self._job_path(job_id)
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            return None

    def _barrer_jobs(self):
        ahora = time.time()
        for p in self.JOBS_DIR.glob('*.json'):
            try:
                mtime = p.stat().st_mtime
            except OSError:
                continue
            job_id = p.stem
            if ahora - mtime > JOB_TTL:
                p.unlink(missing_ok=True)
                shutil.rmtree(self.TMP_DIR / job_id, ignore_errors=True)
                continue
            if ahora - mtime > JOB_STUCK_SECS:
                job = self._read_job(job_id)
                if job and job.get('status') == 'pending':
                    self._write_job(job_id, {
                        'status': 'error', 'result': None,
                        'error': 'Job interrumpido (posible reinicio del contenedor)',
                    })

    def _job_heartbeat(self, job_id: str, stop: threading.Event, interval: float):
        while not stop.wait(interval):
            job = self._read_job(job_id)
            if not job or job.get('status') != 'pending':
                return
            self._write_job(job_id, job)


def _envejecer(path: Path, segundos: float):
    """Fuerza el mtime del archivo a `segundos` atrás (simula un job viejo)."""
    viejo = time.time() - segundos
    os.utime(path, (viejo, viejo))


class TestBarridoTTL(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.jobs = _Jobs(self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_ttl_borra_json_y_tmp_del_job(self):
        jid = '11111111-1111-1111-1111-111111111111'
        # tmp/<jid>/ con cargos.xlsx + resultado.parquet dummy
        (self.dir / jid).mkdir()
        (self.dir / jid / 'cargos.xlsx').write_bytes(b'x')
        (self.dir / jid / 'resultado.parquet').write_bytes(b'y')
        self.jobs._write_job(jid, {'status': 'done', 'result': {'total': 5}, 'error': None})
        _envejecer(self.jobs._job_path(jid), JOB_TTL + 60)

        self.jobs._barrer_jobs()

        self.assertFalse(self.jobs._job_path(jid).exists(), 'el .json debió borrarse por TTL')
        self.assertFalse((self.dir / jid).exists(), 'tmp/<job_id>/ (xlsx+parquet) debió borrarse')

    def test_pending_sin_latido_pasa_a_error_huerfano(self):
        jid = '22222222-2222-2222-2222-222222222222'
        self.jobs._write_job(jid, {'status': 'pending', 'result': None, 'error': None})
        # Entre STUCK y TTL: huérfano, pero no vencido por TTL.
        _envejecer(self.jobs._job_path(jid), JOB_STUCK_SECS + 60)

        self.jobs._barrer_jobs()

        job = self.jobs._read_job(jid)
        self.assertIsNotNone(job)
        self.assertEqual(job['status'], 'error')
        self.assertIn('interrumpido', job['error'].lower())
        # Esquema que Node parsea: status/result/error presentes.
        self.assertIsNone(job['result'])

    def test_done_viejo_pero_no_vencido_queda_intacto(self):
        jid = '33333333-3333-3333-3333-333333333333'
        self.jobs._write_job(jid, {'status': 'done', 'result': {'total': 9}, 'error': None})
        # Más viejo que STUCK pero no que TTL: NO es 'pending', no se marca huérfano.
        _envejecer(self.jobs._job_path(jid), JOB_STUCK_SECS + 60)

        self.jobs._barrer_jobs()

        job = self.jobs._read_job(jid)
        self.assertEqual(job['status'], 'done', 'un done viejo (<TTL) no debe tocarse')

    def test_pending_fresco_no_se_marca_huerfano(self):
        jid = '44444444-4444-4444-4444-444444444444'
        self.jobs._write_job(jid, {'status': 'pending', 'result': None, 'error': None})
        # Recién escrito (mtime fresco): el worker está vivo/latiendo.
        self.jobs._barrer_jobs()
        job = self.jobs._read_job(jid)
        self.assertEqual(job['status'], 'pending', 'un pending fresco no es huérfano')


class TestHeartbeat(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.jobs = _Jobs(self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_heartbeat_refresca_mtime_mientras_pending(self):
        jid = '55555555-5555-5555-5555-555555555555'
        self.jobs._write_job(jid, {'status': 'pending', 'result': None, 'error': None})
        # Envejecer artificialmente para detectar el refresco.
        _envejecer(self.jobs._job_path(jid), 500)
        mtime_viejo = self.jobs._job_path(jid).stat().st_mtime

        stop = threading.Event()
        t = threading.Thread(
            target=self.jobs._job_heartbeat, args=(jid, stop, 0.05), daemon=True
        )
        t.start()
        time.sleep(0.15)  # ~2-3 latidos
        stop.set()
        t.join(timeout=2)

        mtime_nuevo = self.jobs._job_path(jid).stat().st_mtime
        self.assertGreater(mtime_nuevo, mtime_viejo, 'el latido debió refrescar el mtime')
        # Sigue pending (el latido no cambia el estado).
        self.assertEqual(self.jobs._read_job(jid)['status'], 'pending')

    def test_heartbeat_para_cuando_el_job_deja_de_estar_pending(self):
        jid = '66666666-6666-6666-6666-666666666666'
        self.jobs._write_job(jid, {'status': 'pending', 'result': None, 'error': None})
        stop = threading.Event()
        t = threading.Thread(
            target=self.jobs._job_heartbeat, args=(jid, stop, 0.05), daemon=True
        )
        t.start()
        # El worker termina: escribe 'done'.
        self.jobs._write_job(jid, {'status': 'done', 'result': {'total': 1}, 'error': None})
        time.sleep(0.15)
        # El heartbeat debe haber salido solo (status != pending) sin pisar 'done'.
        self.assertEqual(self.jobs._read_job(jid)['status'], 'done')
        stop.set()
        t.join(timeout=2)
        self.assertFalse(t.is_alive(), 'el hilo de latido debió terminar')


if __name__ == '__main__':
    unittest.main()
