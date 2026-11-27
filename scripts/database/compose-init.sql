\getenv app_password MARKETPLACE_APP_PASSWORD
CREATE ROLE marketplace_app LOGIN PASSWORD :'app_password';
ALTER DATABASE marketplace_webhook_service OWNER TO marketplace_app;
REVOKE ALL ON DATABASE marketplace_webhook_service FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO marketplace_app;
