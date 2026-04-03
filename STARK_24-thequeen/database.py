from sqlmodel import create_engine, Session, SQLModel
import mysql.connector

# --- Configuration ---
MYSQL_URL = "mysql+mysqlconnector://root:Arun2006@127.0.0.1:3306/Learning"
SQLITE_URL = "sqlite:///./transcripts.db"

# --- SMART ENGINE SELECTION ---
DATABASE_URL = MYSQL_URL

def test_mysql_connection():
    try:
        conn = mysql.connector.connect(
            host="127.0.0.1",
            user="root",
            password="Arun2006",
            connect_timeout=2
        )
        conn.close()
        return True
    except Exception:
        return False

# Check if MySQL is accessible, otherwise fallback to SQLite
if not test_mysql_connection():
    print("[Database] MySQL connection failed (Access Denied). Falling back to SQLite...")
    DATABASE_URL = SQLITE_URL
else:
    print("[Database] Successfully connected to MySQL.")

# Create the engine based on the selected URL
engine = create_engine(DATABASE_URL, echo=False)

def init_db():
    if "mysql" in DATABASE_URL:
        try:
            conn = mysql.connector.connect(host="127.0.0.1", user="root", password="Arun2006")
            cursor = conn.cursor()
            cursor.execute("CREATE DATABASE IF NOT EXISTS Learning")
            conn.close()
        except Exception as e:
            print(f"[Database] Could not create MySQL database: {e}")

    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
