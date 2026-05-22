from logging import Logger, getLogger
from logging.config import dictConfig


def build_logging_config(level: str = "INFO") -> dict[str, object]:
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
            }
        },
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "formatter": "default",
            }
        },
        "root": {
            "level": level,
            "handlers": ["default"],
        },
    }


def configure_logging(level: str = "INFO") -> None:
    dictConfig(build_logging_config(level))


def get_logger(name: str | None = None) -> Logger:
    return getLogger(name)
