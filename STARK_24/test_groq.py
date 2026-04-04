from groq import Groq
import os

client = Groq(api_key="GROQ_API_KEY")
try:
    response = client.models.list()
    print("Success: models listed successfully!")
except Exception as e:
    print("Exception:")
    print(repr(e))
