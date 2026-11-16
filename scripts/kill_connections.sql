SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'srrhh_sync' AND pid <> pg_backend_pid();
