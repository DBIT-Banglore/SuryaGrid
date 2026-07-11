"""Tests for new Settings fields and scheduler lifecycle (opt-in real-time ingestion)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Settings — new scheduler fields
# ---------------------------------------------------------------------------


def test_scheduler_disabled_by_default():
    """SCHEDULER_ENABLED must default to False so production is opt-in."""
    from app.config import Settings

    s = Settings()
    assert s.SCHEDULER_ENABLED is False


def test_ingest_interval_default_fifteen_minutes():
    from app.config import Settings

    s = Settings()
    assert s.INGEST_INTERVAL_MINUTES == 15


def test_scheduler_enabled_via_env(monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "true")
    # Force a fresh Settings (bypass lru_cache by instantiating directly)
    from app.config import Settings

    s = Settings()
    assert s.SCHEDULER_ENABLED is True


def test_ingest_interval_override_via_env(monkeypatch):
    monkeypatch.setenv("INGEST_INTERVAL_MINUTES", "5")
    from app.config import Settings

    s = Settings()
    assert s.INGEST_INTERVAL_MINUTES == 5



# ---------------------------------------------------------------------------
# Scheduler lifecycle — start disabled (no-op), stop safety
# ---------------------------------------------------------------------------


def test_start_scheduler_noop_when_disabled():
    """start_scheduler() must return without creating a scheduler when disabled."""
    from app.config import Settings
    from app.core import scheduler as sched_module

    fake_settings = Settings()
    assert fake_settings.SCHEDULER_ENABLED is False

    # Reset module-level state
    original_scheduler = sched_module._scheduler
    try:
        sched_module._scheduler = None
        with patch("app.core.scheduler.get_settings", return_value=fake_settings):
            from app.core.scheduler import start_scheduler

            start_scheduler()
        assert sched_module._scheduler is None  # must NOT have created a scheduler
    finally:
        sched_module._scheduler = original_scheduler


def test_stop_scheduler_noop_when_none():
    """stop_scheduler() with no running scheduler must not raise."""
    from app.core import scheduler as sched_module
    from app.core.scheduler import stop_scheduler

    original_scheduler = sched_module._scheduler
    try:
        sched_module._scheduler = None
        stop_scheduler()  # must not raise
        assert sched_module._scheduler is None
    finally:
        sched_module._scheduler = original_scheduler


def test_stop_scheduler_shuts_down_and_clears():
    """stop_scheduler() must call shutdown() and set _scheduler to None."""
    from app.core import scheduler as sched_module
    from app.core.scheduler import stop_scheduler

    mock_scheduler = MagicMock()
    original_scheduler = sched_module._scheduler
    try:
        sched_module._scheduler = mock_scheduler
        stop_scheduler()
        mock_scheduler.shutdown.assert_called_once_with(wait=False)
        assert sched_module._scheduler is None
    finally:
        sched_module._scheduler = original_scheduler


def test_start_scheduler_creates_scheduler_when_enabled():
    """When SCHEDULER_ENABLED=True, start_scheduler() creates and starts a scheduler."""
    from app.config import Settings
    from app.core import scheduler as sched_module
    from app.core.scheduler import start_scheduler, stop_scheduler

    enabled_settings = Settings(SCHEDULER_ENABLED=True, INGEST_INTERVAL_MINUTES=15)
    original_scheduler = sched_module._scheduler

    with patch("app.core.scheduler.get_settings", return_value=enabled_settings):
        mock_apscheduler = MagicMock()
        with patch("app.core.scheduler.AsyncIOScheduler", return_value=mock_apscheduler):
            try:
                sched_module._scheduler = None
                start_scheduler()
                # Scheduler was created and started
                mock_apscheduler.add_job.assert_called_once()
                mock_apscheduler.start.assert_called_once()
            finally:
                # Clean up: avoid actually running the scheduler
                sched_module._scheduler = None
                sched_module._scheduler = original_scheduler


def test_start_scheduler_uses_configured_interval():
    """The scheduler job must use INGEST_INTERVAL_MINUTES from settings."""
    from app.config import Settings
    from app.core import scheduler as sched_module
    from app.core.scheduler import start_scheduler

    enabled_settings = Settings(SCHEDULER_ENABLED=True, INGEST_INTERVAL_MINUTES=30)
    original_scheduler = sched_module._scheduler

    with patch("app.core.scheduler.get_settings", return_value=enabled_settings):
        mock_apscheduler = MagicMock()
        with patch("app.core.scheduler.AsyncIOScheduler", return_value=mock_apscheduler):
            try:
                sched_module._scheduler = None
                start_scheduler()
                call_kwargs = mock_apscheduler.add_job.call_args
                assert call_kwargs[1]["minutes"] == 30
            finally:
                sched_module._scheduler = None
                sched_module._scheduler = original_scheduler


if __name__ == "__main__":
    test_scheduler_disabled_by_default()
    test_ingest_interval_default_fifteen_minutes()
    test_start_scheduler_noop_when_disabled()
    test_stop_scheduler_noop_when_none()
    test_stop_scheduler_shuts_down_and_clears()
    print("All config/scheduler tests PASSED")