from flask import Flask, request, jsonify, send_file
import minio
import requests
import uuid
from io import BytesIO
from werkzeug.datastructures import FileStorage
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# MinIO configuration
BUCKET_NAME = os.getenv("BUCKET_NAME")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL")

# Initialize MinIO client
minio_client = minio.Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

# Ensure bucket exists
try:
    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)
except Exception as e:
    app.logger.error(f"Failed to create bucket: {e}")

def is_nothing(value):
    return value is None or value == ""

def get_user_info(access_token):
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.post(
            f"{KEYCLOAK_URL}/realms/my-app-realm/protocol/openid-connect/userinfo",
            headers=headers,
        )
        response.raise_for_status()
        print("got user info:"+str(response.status_code))
        return response.json()
    except requests.RequestException as e:
        app.logger.error(f"User Info Error: {e}")
        return {"name": None}

def is_token_valid(token):
    user_info = get_user_info(token)
    print("user:",user_info)
    return not is_nothing(user_info.get("name"))

@app.before_request
def authenticate():
    if request.endpoint in ["upload", "download", "update", "delete"]:
        token = request.headers.get("Authorization")
        if not token or not token.startswith("Bearer "):
            return jsonify({"message": "Authorization header required."}), 401
        token = token.split("Bearer ")[1].strip()

        if is_nothing(token) or not is_token_valid(token):
            return jsonify({"message": "Invalid authorization header."}), 401

@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"message": "No file uploaded."}), 400
    file = request.files["file"]
    file_id = str(uuid.uuid4())
    
    try:
        file_data = file.read()
        file_size = len(file_data)
        
        minio_client.put_object(
            bucket_name=BUCKET_NAME,
            object_name=file_id,
            data=BytesIO(file_data),
            length=file_size,
            content_type=file.mimetype
        )
        return jsonify({"fileId": file_id}), 201
    except Exception as e:
        app.logger.error(f"Upload error: {e}")
        return jsonify({"message": "Failed to upload file."}), 500

@app.route("/download/<file_id>", methods=["GET"])
def download(file_id):
    try:
        response = minio_client.get_object(BUCKET_NAME, file_id)
        file_data = response.read()
        content_type = response.headers.get('Content-Type', 'application/octet-stream')
        return send_file(BytesIO(file_data), mimetype=content_type)
    except Exception as e:
        app.logger.error(f"Download error: {e}")
        return jsonify({"message": "File not found."}), 404

@app.route("/update/<file_id>", methods=["PUT"])
def update(file_id):
    if "file" not in request.files:
        return jsonify({"message": "No file uploaded."}), 400
    file = request.files["file"]
    
    try:
        file_data = file.read()
        file_size = len(file_data)
        
        minio_client.put_object(
            bucket_name=BUCKET_NAME,
            object_name=file_id,
            data=BytesIO(file_data),
            length=file_size,
            content_type=file.mimetype
        )
        return jsonify({"message": "File updated successfully."}), 200
    except Exception as e:
        app.logger.error(f"Update error: {e}")
        return jsonify({"message": "Failed to update file."}), 500

@app.route("/delete/<file_id>", methods=["DELETE"])
def delete(file_id):
    try:
        minio_client.remove_object(BUCKET_NAME, file_id)
        return jsonify({"message": "File deleted successfully."}), 200
    except Exception as e:
        app.logger.error(f"Delete error: {e}")
        return jsonify({"message": "Failed to delete file."}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000)