.PHONY: help dev stop run worker test lint format typecheck check-imports audit migrate rollback seed seed-demo backup restore-test clean

help:
	@echo "BRAND HOUSE ERP — Mövcud Əmrlər:"
	@echo "  make dev          - Docker Compose ilə bütün infrastrukturu (api, worker, postgres, redis) başladır"
	@echo "  make stop         - Docker Compose servislərini dayandırır"
	@echo "  make run          - Lokal Uvicorn dev-serverini başladır (port 8000)"
	@echo "  make worker       - Lokal ARQ arxa plan işçisini başladır"
	@echo "  make test         - Pytest ilə bütün vahid və inteqrasiya testlərini icra edir"
	@echo "  make lint         - Ruff linter və format yoxlanışı"
	@echo "  make format       - Ruff ilə kodu avtomatik formatlayır"
	@echo "  make typecheck    - Mypy ilə sərt tip yoxlanışı (--strict)"
	@echo "  make check-imports- Import Linter ilə modulyar asılılıq qaydalarını yoxlayır"
	@echo "  make audit        - Pip-audit ilə asılılıqların təhlükəsizlik skanı"
	@echo "  make migrate      - Alembic ilə ən son miqrasiyaları tətbiq edir (upgrade head)"
	@echo "  make rollback     - Sonuncu miqrasiyanı geri qaytarır (downgrade -1)"
	@echo "  make seed         - Referans məlumatlarını bazaya yazır (idempotent)"
	@echo "  make seed-demo    - Demo məlumatlarını bazaya yazır (yalnız dev/test)"
	@echo "  make backup       - Verilənlər bazasının ehtiyat nüsxəsini çıxarır"
	@echo "  make restore-test - Ehtiyat nüsxənin bərpasını test edir"

dev:
	docker compose up -d --build
	@echo "Servislər başladıldı. Swagger: http://localhost:8000/docs"

stop:
	docker compose down

run:
	uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

worker:
	python -m arq app.worker.WorkerSettings

test:
	pytest -v --cov=app --cov-report=term-missing

lint:
	ruff check .
	ruff format --check .

format:
	ruff format .
	ruff check --fix .

typecheck:
	mypy app scripts tests

check-imports:
	lint-imports

audit:
	pip-audit

migrate:
	alembic upgrade head

rollback:
	alembic downgrade -1

seed:
	python scripts/seed.py reference

seed-demo:
	python scripts/seed.py demo

backup:
	python scripts/backup.py --type full

restore-test:
	python scripts/restore.py --test-latest

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache .mypy_cache .coverage htmlcov

