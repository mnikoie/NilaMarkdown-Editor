from fastapi import FastAPI

app = FastAPI(title="سرویسِ پردازشِ فارسی")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/normalize")
def normalize(text: str):
    """نمونهٔ ساده: یکدست‌کردنِ «ی» و «ک»‌ِ عربی به فارسی."""
    return {"text": text.replace("ي", "ی").replace("ك", "ک")}
