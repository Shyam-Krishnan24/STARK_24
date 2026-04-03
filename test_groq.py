from groq import Groq
import os

client = Groq(api_key="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")
try:
    response = client.models.list()
    print("Success: models listed successfully!")
except Exception as e:
    print("Exception:")
    print(repr(e))
