import requests

url = "http://127.0.0.1:8000/chat"
payload = {
  "prompt": "Hello",
  "system_instruction": "You are a helpful assistant."
}
response = requests.post(url, json=payload)
print("Status:", response.status_code)
print("Response:", response.text)
