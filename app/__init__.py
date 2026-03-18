from flask import Flask
from .agent.webhook import webhook_bp
from .db.init import init_database


def create_app():
    app = Flask(__name__, static_folder="../public")
    app.config.from_object("config.Config")

    app.register_blueprint(webhook_bp)

    # Initialise schema (graceful degradation if DB is down)
    try:
        init_database()
    except Exception as err:
        print(f"[App] DB unavailable at startup — running in stateless mode: {err}")

    return app
