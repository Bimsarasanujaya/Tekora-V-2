from __future__ import annotations
import csv, io, json, os, time, secrets, re, smtplib, ssl
from functools import wraps
from pathlib import Path
from typing import Dict, Any
from urllib.parse import urlencode
import requests
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, Response, abort
from werkzeug.security import generate_password_hash, check_password_hash
from engine import build_signal, scan_best_setups, get_klines, update_trade_status, v10_market_pulse, analyze_forex_screenshot
from ai_core import enhance_signal, ai_lab_snapshot

BASE = Path(__file__).parent; DATA = BASE / "data"; DATA.mkdir(exist_ok=True)
USERS_FILE = DATA / "users.json"; TRADES_FILE = DATA / "trades.json"
PROFILE_FILE = DATA / "profiles.json"
MEMORY_FILE = DATA / "signal_memory.json"
PAYMENTS_FILE = DATA / "payments.json"
PAYPAL_EVENTS_FILE = DATA / "paypal_events.json"
RESET_FILE = DATA / "password_resets.json"
VERIFY_FILE = DATA / "email_verifications.json"
EMAIL_OUTBOX_FILE = DATA / "email_outbox.json"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
app = Flask(__name__); app.secret_key = os.environ.get("TEKORA_SECRET", secrets.token_hex(32))

def load_json(path: Path, default):
    if not path.exists(): path.write_text(json.dumps(default, indent=2))
    try: return json.loads(path.read_text())
    except Exception: return default

def save_json(path: Path, data): path.write_text(json.dumps(data, indent=2))
def current_user(): return session.get("user")

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user"): return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper

def _now() -> int:
    return int(time.time())

def _fmt_date(ts: int) -> str:
    try:
        return time.strftime("%Y-%m-%d", time.localtime(int(ts)))
    except Exception:
        return "—"


def _public_base_url() -> str:
    base = os.environ.get("TEKORA_BASE_URL", "").strip().rstrip("/")
    if base:
        return base
    try:
        return request.host_url.rstrip("/")
    except Exception:
        return "http://127.0.0.1:5000"

def _smtp_configured() -> bool:
    return bool(os.environ.get("TEKORA_SMTP_HOST") and os.environ.get("TEKORA_SMTP_USERNAME") and os.environ.get("TEKORA_SMTP_PASSWORD"))

def _send_email(to_email: str, subject: str, body: str, kind: str="general", link: str="") -> bool:
    """Send email using SMTP. For Gmail use a Google App Password, not the normal Gmail password.
    Required env vars:
      TEKORA_SMTP_HOST=smtp.gmail.com
      TEKORA_SMTP_PORT=587
      TEKORA_SMTP_USERNAME=yourgmail@gmail.com
      TEKORA_SMTP_PASSWORD=your_16_digit_gmail_app_password
      TEKORA_SMTP_FROM=Tekora <yourgmail@gmail.com>
      TEKORA_BASE_URL=https://yourdomain.pythonanywhere.com
    """
    sender = os.environ.get('TEKORA_SMTP_FROM', os.environ.get('TEKORA_SMTP_USERNAME','Tekora'))
    msg = f"From: {sender}\r\nTo: {to_email}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    if not _smtp_configured():
        outbox = load_json(EMAIL_OUTBOX_FILE, [])
        outbox.insert(0, {"to": to_email, "subject": subject, "body": body, "link": link, "kind": kind, "created_at": _now(), "status": "SMTP_NOT_CONFIGURED"})
        save_json(EMAIL_OUTBOX_FILE, outbox[:80])
        print(f"TEKORA EMAIL OUTBOX [{kind}]:", link or subject)
        return False
    host=os.environ.get("TEKORA_SMTP_HOST")
    port=int(os.environ.get("TEKORA_SMTP_PORT", "587"))
    username=os.environ.get("TEKORA_SMTP_USERNAME")
    password=os.environ.get("TEKORA_SMTP_PASSWORD")
    try:
        if port == 465:
            context=ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
                server.login(username, password)
                server.sendmail(username, [to_email], msg.encode("utf-8"))
        else:
            with smtplib.SMTP(host, port, timeout=20) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(username, password)
                server.sendmail(username, [to_email], msg.encode("utf-8"))
        return True
    except Exception as exc:
        outbox = load_json(EMAIL_OUTBOX_FILE, [])
        outbox.insert(0, {"to": to_email, "subject": subject, "body": body, "link": link, "kind": kind, "created_at": _now(), "status": "SMTP_ERROR", "error": str(exc)})
        save_json(EMAIL_OUTBOX_FILE, outbox[:80])
        print("TEKORA EMAIL SEND ERROR:", exc, "LINK:", link)
        return False

def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    subject = "Reset your Tekora password"
    body = f"""Hi,

Use this secure link to reset your Tekora password:
{reset_link}

This link expires in 1 hour. If you did not request this, ignore this email.

Tekora Team
"""
    return _send_email(to_email, subject, body, kind="password_reset", link=reset_link)

def send_verification_email(to_email: str, verify_link: str) -> bool:
    subject = "Confirm your Tekora account"
    body = f"""Welcome to Tekora,

Confirm your email to secure your account and connect subscriptions to this email:
{verify_link}

This link expires in 24 hours.

Tekora Team
"""
    return _send_email(to_email, subject, body, kind="email_verification", link=verify_link)

def create_email_verification(email: str) -> str:
    token = secrets.token_urlsafe(32)
    verifications = load_json(VERIFY_FILE,{})
    verifications[token] = {"email": email, "created_at": _now(), "expires_at": _now()+24*3600, "used": False}
    save_json(VERIFY_FILE, verifications)
    return token

def get_payment_record(user: str) -> Dict[str, Any]:
    payments = load_json(PAYMENTS_FILE,{})
    rec = payments.get(user) or {}
    users = load_json(USERS_FILE,{})
    created = int(users.get(user,{}).get("created", _now()))
    trial_until = int(rec.get("trial_until") or users.get(user,{}).get("trial_until") or (created + 7*24*3600))
    paid_until = int(rec.get("paid_until") or 0)
    active_until = max(trial_until, paid_until)
    status = "ACTIVE" if active_until >= _now() else "LOCKED"
    plan = rec.get("plan", "7 Day Trial" if paid_until <= trial_until else "Tekora Pro")
    return {"user":user,"status":status,"plan":plan,"trial_until":trial_until,"paid_until":paid_until,"active_until":active_until,
            "active_until_date":_fmt_date(active_until),"telegram":rec.get("telegram",""),"last_request":rec.get("last_request",{})}

def harden_signal(signal: Dict[str, Any], source: str="engine") -> Dict[str, Any]:
    # Phase 1 guardrail: keep UI/order labels aligned with execution action and avoid blank values breaking cards.
    if not isinstance(signal, dict):
        return {"ok":False,"error":"Engine returned invalid signal object","source":source}
    action = str(signal.get("action") or "SIGNAL ONLY").upper().strip()
    signal["action"] = action
    if action == "EXECUTE NOW":
        signal["entry_label"] = "Market Entry"
    elif action == "LIMIT ENTRY":
        signal["entry_label"] = "Limit Entry"
    elif action == "WAIT FOR RETEST":
        signal["entry_label"] = "Retest Zone"
    elif action == "HIGH RISK":
        signal["entry_label"] = signal.get("entry_label") or "High Risk Zone"
    elif action == "RECOVERY SETUP":
        signal["entry_label"] = signal.get("entry_label") or "Recovery Entry"
    else:
        signal["entry_label"] = signal.get("entry_label") or "Reference Entry"
    signal.setdefault("entry_value", signal.get("entry") or signal.get("limit_entry") or signal.get("mid_entry") or "—")
    signal.setdefault("stop_loss", signal.get("sl") or "—")
    for k in ["tp1","tp2","tp3"]: signal.setdefault(k, "—")
    signal.setdefault("score", 0); signal.setdefault("grade", "—")
    signal.setdefault("engine_version", "Tekora Engine")
    signal.setdefault("accuracy_note", "Honest rule-based signal. No guaranteed win rate. Risk small and verify market context.")
    signal["execution_lock"] = f"{action} uses {signal.get('entry_label')} only"
    return signal

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/login", methods=["GET","POST"])
def login():
    msg=""
    if request.method=="POST":
        username=request.form.get("username","").strip().lower(); password=request.form.get("password","")
        users=load_json(USERS_FILE,{})
        if username in users and check_password_hash(users[username]["password"], password):
            session["user"]=username; return redirect(url_for("dashboard"))
        msg="Invalid email or password."
    return render_template("login.html", msg=msg or request.args.get("oauth_msg", ""))

@app.route("/signup", methods=["GET","POST"])
def signup():
    msg=""
    if request.method=="POST":
        email=request.form.get("username","").strip().lower()
        password=request.form.get("password","")
        confirm=request.form.get("confirm","")
        first_name=request.form.get("first_name","").strip()[:60]
        last_name=request.form.get("last_name","").strip()[:60]
        users=load_json(USERS_FILE,{})
        if not EMAIL_RE.match(email): msg="Enter a valid email address."
        elif len(password)<8: msg="Password must be at least 8 characters."
        elif password != confirm: msg="Confirm password does not match the password."
        elif email in users: msg="Account already exists. Please log in."
        else:
            now=int(time.time())
            users[email]={"password":generate_password_hash(password),"email":email,"first_name":first_name,"last_name":last_name,
                          "created":now,"trial_until":now+7*24*3600,"provider":"email","email_verified":False}
            save_json(USERS_FILE,users)
            token = create_email_verification(email)
            verify_link = f"{_public_base_url()}{url_for('verify_email', token=token)}"
            send_verification_email(email, verify_link)
            session["user"]=email
            return redirect(url_for("dashboard", welcome="verify"))
    return render_template("signup.html", msg=msg)


@app.route("/forgot-password", methods=["GET","POST"])
def forgot_password():
    msg=""
    if request.method=="POST":
        email=request.form.get("username","").strip().lower()
        users=load_json(USERS_FILE,{})
        # Do not reveal whether an email exists. That is safer and more professional.
        if email in users:
            token=secrets.token_urlsafe(32)
            resets=load_json(RESET_FILE,{})
            resets[token]={"email":email,"created_at":_now(),"expires_at":_now()+3600,"used":False}
            save_json(RESET_FILE,resets)
            reset_link=f"{_public_base_url()}{url_for('reset_password', token=token)}"
            send_password_reset_email(email, reset_link)
        msg="If that email is registered, a password reset link has been sent. Check your inbox/spam."
    return render_template("forgot_password.html", msg=msg)

@app.route("/reset-password/<token>", methods=["GET","POST"])
def reset_password(token):
    resets=load_json(RESET_FILE,{})
    rec=resets.get(token)
    if not rec or rec.get("used") or int(rec.get("expires_at",0)) < _now():
        return render_template("reset_password.html", msg="This reset link is invalid or expired.", valid=False)
    msg=""
    if request.method=="POST":
        password=request.form.get("password","")
        confirm=request.form.get("confirm","")
        if len(password)<8:
            msg="New password must be at least 8 characters."
        elif password != confirm:
            msg="Confirm password does not match."
        else:
            users=load_json(USERS_FILE,{})
            email=rec["email"]
            if email in users:
                users[email]["password"]=generate_password_hash(password)
                users[email]["password_reset_at"]=_now()
                save_json(USERS_FILE,users)
            rec["used"]=True; resets[token]=rec; save_json(RESET_FILE,resets)
            return redirect(url_for("login", oauth_msg="Password reset successful. Log in with your new password."))
    return render_template("reset_password.html", msg=msg, valid=True)


@app.route("/google-login")
def google_login():
    # Alias kept for current buttons. Starts real Google OAuth when credentials are configured.
    return redirect(url_for("auth_google"))

@app.route("/auth/google")
def auth_google():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        return redirect(url_for("login", oauth_msg="Google login needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before launch."))
    state = secrets.token_urlsafe(24)
    session["google_oauth_state"] = state
    redirect_uri = f"{_public_base_url()}{url_for('auth_google_callback')}"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": state,
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))

@app.route("/auth/google/callback")
def auth_google_callback():
    if request.args.get("state") != session.get("google_oauth_state"):
        return redirect(url_for("login", oauth_msg="Google login security check failed. Try again."))
    code = request.args.get("code")
    if not code:
        return redirect(url_for("login", oauth_msg="Google login was cancelled or failed."))
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = f"{_public_base_url()}{url_for('auth_google_callback')}"
    try:
        token_resp = requests.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }, timeout=20)
        token_resp.raise_for_status()
        access_token = token_resp.json().get("access_token")
        info_resp = requests.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
        info_resp.raise_for_status()
        info = info_resp.json()
        email = str(info.get("email", "")).strip().lower()
        if not EMAIL_RE.match(email):
            return redirect(url_for("login", oauth_msg="Google did not return a valid email."))
        users = load_json(USERS_FILE,{})
        now = _now()
        if email not in users:
            users[email] = {
                "password": generate_password_hash(secrets.token_urlsafe(32)),
                "email": email,
                "first_name": str(info.get("given_name", ""))[:60],
                "last_name": str(info.get("family_name", ""))[:60],
                "created": now,
                "trial_until": now+7*24*3600,
                "provider": "google",
                "google_sub": info.get("sub"),
                "email_verified": bool(info.get("email_verified", True)),
                "picture": info.get("picture", ""),
            }
        else:
            users[email].update({"provider": users[email].get("provider","email+google"), "google_sub": info.get("sub"), "email_verified": bool(info.get("email_verified", users[email].get("email_verified", False))), "picture": info.get("picture", users[email].get("picture","")), "last_google_login": now})
        save_json(USERS_FILE, users)
        session.pop("google_oauth_state", None)
        session["user"] = email
        return redirect(url_for("dashboard"))
    except Exception as exc:
        app.logger.exception("Google OAuth failed")
        return redirect(url_for("login", oauth_msg=f"Google login failed: {str(exc)[:120]}"))

@app.route("/verify-email/<token>")
def verify_email(token):
    verifications = load_json(VERIFY_FILE,{})
    rec = verifications.get(token)
    if not rec or rec.get("used") or int(rec.get("expires_at",0)) < _now():
        return redirect(url_for("login", oauth_msg="Email verification link is invalid or expired."))
    users = load_json(USERS_FILE,{})
    email = rec.get("email")
    if email in users:
        users[email]["email_verified"] = True
        users[email]["email_verified_at"] = _now()
        save_json(USERS_FILE, users)
    rec["used"] = True
    verifications[token] = rec
    save_json(VERIFY_FILE, verifications)
    session["user"] = email
    return redirect(url_for("dashboard", verified="1"))

@app.post("/api/auth/resend-verification")
@login_required
def api_resend_verification():
    users = load_json(USERS_FILE,{})
    email = current_user()
    if users.get(email,{}).get("email_verified"):
        return jsonify({"ok": True, "message": "Email already verified."})
    token = create_email_verification(email)
    verify_link = f"{_public_base_url()}{url_for('verify_email', token=token)}"
    sent = send_verification_email(email, verify_link)
    return jsonify({"ok": True, "sent": sent, "message": "Verification link sent. If SMTP is not configured, check data/email_outbox.json."})

@app.route("/logout")
def logout(): session.clear(); return redirect(url_for("home"))

@app.route("/dashboard")
@login_required
def dashboard(): return render_template("dashboard.html", user=current_user(), active="dashboard", access=get_payment_record(current_user()))

@app.route("/account")
@login_required
def account():
    users=load_json(USERS_FILE,{})
    profile=users.get(current_user(),{})
    return render_template("account.html", user=current_user(), active="account", access=get_payment_record(current_user()), profile=profile)
@app.route("/live-trades")
@login_required
def live_trades(): return render_template("live_trades.html", user=current_user(), active="live", access=get_payment_record(current_user()))
@app.route("/journal")
@login_required
def journal(): return render_template("journal.html", user=current_user(), active="journal", access=get_payment_record(current_user()))
@app.route("/ai-engine")
@login_required
def ai_engine(): return render_template("ai_engine.html", user=current_user(), active="ai", access=get_payment_record(current_user()))

@app.route("/forex-ai")
@login_required
def forex_ai(): return render_template("forex_ai.html", user=current_user(), active="forex")

@app.route("/info")
@login_required
def info(): return render_template("info.html", user=current_user(), active="info", access=get_payment_record(current_user()))

@app.route("/billing")
@login_required
def billing(): return render_template("billing.html", user=current_user(), active="billing", access=get_payment_record(current_user()))

@app.get("/api/billing/status")
@login_required
def api_billing_status():
    return jsonify(get_payment_record(current_user()))

@app.post("/api/billing/request")
@login_required
def api_billing_request():
    data=request.get_json(force=True)
    payments=load_json(PAYMENTS_FILE,{})
    rec=payments.get(current_user(),{})
    rec["telegram"] = str(data.get("telegram", rec.get("telegram", "")))[:80]
    rec["last_request"] = {"plan":str(data.get("plan","monthly"))[:40],"note":str(data.get("note",""))[:240],"requested_at":_now(),"status":"PENDING MANUAL CONFIRMATION"}
    payments[current_user()]=rec; save_json(PAYMENTS_FILE,payments)
    return jsonify({"ok":True,"message":"Access request saved. Admin can activate after payment confirmation.","access":get_payment_record(current_user())})



@app.post("/api/billing/checkout")
@login_required
def api_billing_checkout():
    data=request.get_json(force=True)
    plan=str(data.get("plan","pro_monthly"))
    prices={"starter_monthly":20,"pro_monthly":50,"starter_annual":192,"pro_annual":480}
    if plan not in prices:
        return jsonify({"ok":False,"error":"Unknown plan"}),400
    payments=load_json(PAYMENTS_FILE,{})
    rec=payments.get(current_user(),{})
    order_id="TKO-"+secrets.token_hex(8).upper()
    rec["pending_order"]={"order_id":order_id,"plan":plan,"amount_usd":prices[plan],"email":current_user(),"created_at":_now(),"gateway":"paypal-ready"}
    payments[current_user()]=rec; save_json(PAYMENTS_FILE,payments)
    return jsonify({"ok":True,"order_id":order_id,"amount_usd":prices[plan],"email":current_user(),"message":"PayPal buttons can capture this order in the next step."})

@app.post("/api/billing/demo-complete")
@login_required
def api_billing_demo_complete():
    # Dev-only immediate activation so you can test subscription UX before PayPal buttons/webhooks are connected.
    if os.environ.get("TEKORA_ALLOW_DEMO_PAYMENT","1") != "1":
        return jsonify({"ok":False,"error":"Demo payment disabled"}),403
    data=request.get_json(force=True)
    plan=str(data.get("plan","pro_monthly"))
    days=365 if plan.endswith("annual") else 30
    payments=load_json(PAYMENTS_FILE,{})
    rec=payments.get(current_user(),{})
    base=max(_now(), int(rec.get("paid_until",0) or 0))
    rec["paid_until"]=base+days*24*3600
    rec["plan"]="Tekora Pro" if "pro" in plan else "Tekora Starter"
    rec["last_payment"]={"gateway":"DEMO_PAYPAL_READY","email":current_user(),"plan":plan,"days":days,"completed_at":_now(),"status":"COMPLETED"}
    payments[current_user()]=rec; save_json(PAYMENTS_FILE,payments)
    return jsonify({"ok":True,"access":get_payment_record(current_user())})

@app.post("/api/paypal/webhook")
def api_paypal_webhook():
    # PayPal webhook receiver placeholder. In production verify PayPal signature before activation.
    event=request.get_json(force=True, silent=True) or {}
    events=load_json(PAYPAL_EVENTS_FILE,[])
    events.insert(0,{"received_at":_now(),"event":event})
    save_json(PAYPAL_EVENTS_FILE,events[:200])
    return jsonify({"ok":True,"note":"Webhook stored. Signature verification + subscription activation wiring is next."})

@app.post("/api/admin/activate")
@login_required
def api_admin_activate():
    # Zero-cost MVP admin activation. Set TEKORA_ADMIN_PIN in production; default pin is for local testing only.
    data=request.get_json(force=True)
    pin=str(data.get("pin", "")); expected=os.environ.get("TEKORA_ADMIN_PIN", "1234")
    if pin != expected:
        return jsonify({"ok":False,"error":"Invalid admin PIN"}), 403
    target=str(data.get("user", current_user())).strip().lower()
    days=max(1,min(365,int(data.get("days",30))))
    payments=load_json(PAYMENTS_FILE,{})
    rec=payments.get(target,{})
    base=max(_now(), int(rec.get("paid_until",0) or 0))
    rec["paid_until"] = base + days*24*3600
    rec["plan"] = str(data.get("plan","Tekora Pro"))[:60]
    rec["activated_at"] = _now(); rec["activated_by"] = current_user()
    payments[target]=rec; save_json(PAYMENTS_FILE,payments)
    return jsonify({"ok":True,"access":get_payment_record(target)})

def auto_track_signal(signal: Dict[str,Any], source: str="generated") -> Dict[str,Any]:
    trades=load_json(TRADES_FILE,{}); user=current_user() or "guest"; trades.setdefault(user,[]); now=int(time.time())
    sig=f"{signal.get('symbol')}|{signal.get('timeframe')}|{signal.get('action')}|{signal.get('entry_value')}|{signal.get('stop_loss')}"
    for tr in trades[user][:8]:
        if tr.get("signature")==sig and now-int(tr.get("tracked_at",0))<180:
            signal.update({"track_id":tr.get("track_id"),"status":tr.get("status","RUNNING"),"auto_tracked":True})
            return signal
    trade=dict(signal)
    action = str(signal.get("action", "")).upper()
    initial_status = "RUNNING" if action == "EXECUTE NOW" else ("WAITING ENTRY" if action in ["LIMIT ENTRY", "WAIT FOR RETEST"] else "SIGNAL ONLY")
    first_event = "MARKET ENTRY TRACKED" if initial_status == "RUNNING" else ("WAITING FOR ENTRY TRIGGER" if initial_status == "WAITING ENTRY" else "SIGNAL SAVED")
    trade.update({"tracked_at":now,"track_id":f"T-{now}-{len(trades[user])+1}","status":initial_status,"entry_filled": initial_status == "RUNNING", "source":source,"signature":sig,
                                      "timeline":[{"time":time.strftime("%H:%M:%S"),"event":first_event}]})
    trades[user].insert(0,trade); save_json(TRADES_FILE,trades)
    signal.update({"track_id":trade["track_id"],"status":initial_status,"entry_filled": trade["entry_filled"],"auto_tracked":True})
    return signal




@app.post("/api/forex-analyze")
@login_required
def api_forex_analyze():
    upload_dir = DATA / "uploads"
    upload_dir.mkdir(exist_ok=True)
    img = request.files.get("chart")
    if not img:
        return jsonify({"error":"Upload a chart screenshot first."}), 400
    safe_name = f"{int(time.time())}_{secrets.token_hex(4)}_chart.png"
    img_path = upload_dir / safe_name
    img.save(img_path)
    concepts = request.form.getlist("concepts") or request.form.get("concepts","").split(",")
    indicators = request.form.getlist("indicators") or request.form.get("indicators","").split(",")
    payload = {
        "image_path": str(img_path),
        "symbol": request.form.get("symbol","EURUSD"),
        "timeframe": request.form.get("timeframe","15m"),
        "style": request.form.get("style","balanced"),
        "session": request.form.get("session","London"),
        "rr": request.form.get("rr","2"),
        "current_price": request.form.get("current_price",""),
        "concepts": [x for x in concepts if str(x).strip()],
        "indicators": [x for x in indicators if str(x).strip()],
    }
    return jsonify(analyze_forex_screenshot(payload))

@app.get("/api/market-pulse")
@login_required
def api_market_pulse():
    tf=request.args.get("timeframe","15m")
    return jsonify(v10_market_pulse(timeframe=tf))

@app.get("/api/ticker")
@login_required
def api_ticker():
    symbols=["BTCUSDT","ETHUSDT","SOLUSDT","SUIUSDT","BNBUSDT","XRPUSDT"]
    out=[]
    for sym in symbols:
        try:
            ks=get_klines(sym,"15m",3)
            last=ks[-1].close; prev=ks[-2].close if len(ks)>1 else last
            pct=round(((last-prev)/prev)*100,2) if prev else 0
            out.append({"symbol":sym,"price":round(last, 5 if last<10 else 2),"change":pct})
        except Exception:
            out.append({"symbol":sym,"price":"Live","change":0})
    return jsonify(out)


@app.post("/api/ai-lab")
@login_required
def api_ai_lab():
    try:
        data=request.get_json(force=True)
        return jsonify(ai_lab_snapshot(data.get("symbol","BTCUSDT"), data.get("timeframe","15m"), get_klines))
    except Exception as e:
        app.logger.exception("/api/ai-lab failed")
        return jsonify({"ok":False,"error":str(e)}),500

@app.post("/api/signal")
@login_required
def api_signal():
    try:
        data=request.get_json(force=True)
        signal=build_signal(data.get("symbol","BTCUSDT"), data.get("timeframe","15m"), data.get("mode","scalp"))
        signal=harden_signal(signal,"manual")
        signal=enhance_signal(signal, get_klines, data.get("mode","scalp"))
        return jsonify(auto_track_signal(signal,"manual"))
    except Exception as e:
        app.logger.exception("/api/signal failed")
        return jsonify({"ok": False, "error": "Signal engine failed", "detail": str(e)}), 500

@app.post("/api/scan")
@login_required
def api_scan():
    try:
        data=request.get_json(force=True)
        out=scan_best_setups(data.get("mode","scalp"), data.get("timeframe","15m"), data.get("universe","top100"))
        best=out.get("best") or ((out.get("results") or [None])[0])
        if best:
            best=harden_signal(best,"auto_best")
            best=enhance_signal(best, get_klines, data.get("mode","scalp"))
            best=auto_track_signal(best,"auto_best"); out["results"]=[best]; out["best"]=best
        return jsonify(out)
    except Exception as e:
        app.logger.exception("/api/scan failed")
        return jsonify({"ok": False, "error": "Scan engine failed", "detail": str(e)}), 500

@app.get("/api/trades")
@login_required
def api_trades():
    all_trades=load_json(TRADES_FILE,{}); user=current_user(); trades=all_trades.get(user,[]); updated=[]
    for tr in trades:
        try:
            last=get_klines(tr["symbol"], tr.get("timeframe","15m"), 3)[-1].close
            tr.update(update_trade_status(tr,last))
        except Exception:
            tr.setdefault("status","RUNNING"); tr.setdefault("progress",0)
        updated.append(tr)
    all_trades[user]=updated; save_json(TRADES_FILE,all_trades); return jsonify(updated)

@app.get("/api/journal")
@login_required
def api_journal():
    trades=load_json(TRADES_FILE,{}).get(current_user(),[])
    terminal_status={"TP1 HIT","TP2 HIT","TP3 HIT","SL HIT","EXPIRED"}
    closed=[t for t in trades if t.get("status") in terminal_status]
    wins=[t for t in closed if str(t.get("status","")).startswith("TP")]
    losses=[t for t in closed if t.get("status")=="SL HIT"]
    active=[t for t in trades if t.get("status") in ["RUNNING","WAITING ENTRY","SIGNAL ONLY","DATA SYNCING"]]
    valid_closed=[x for x in closed if x.get("status")!="EXPIRED"]
    win_rate=round((len(wins)/len(valid_closed))*100,1) if valid_closed else 0

    # Advanced analytics
    pair_stats={}
    tf_stats={}
    streak=0
    last_outcomes=[]
    for t in trades:
        sym=t.get("symbol","?")
        tf=t.get("timeframe","?")
        pair_stats.setdefault(sym,{"total":0,"wins":0,"losses":0,"rr":0})
        tf_stats.setdefault(tf,{"total":0,"wins":0,"losses":0,"rr":0})
        pair_stats[sym]["total"]+=1; tf_stats[tf]["total"]+=1
        rr=float(t.get("rr",0) or 0)
        pair_stats[sym]["rr"]+=rr; tf_stats[tf]["rr"]+=rr
        if str(t.get("status","")).startswith("TP"):
            pair_stats[sym]["wins"]+=1; tf_stats[tf]["wins"]+=1; last_outcomes.append("W")
        elif t.get("status")=="SL HIT":
            pair_stats[sym]["losses"]+=1; tf_stats[tf]["losses"]+=1; last_outcomes.append("L")

    for outcome in last_outcomes:
        if outcome=="W":
            streak = streak + 1 if streak >= 0 else 1
        elif outcome=="L":
            streak = streak - 1 if streak <= 0 else -1

    best_pair=max(pair_stats.items(), key=lambda kv:(kv[1]["wins"], kv[1]["rr"], kv[1]["total"]), default=("—",{}))[0]
    best_tf=max(tf_stats.items(), key=lambda kv:(kv[1]["wins"], kv[1]["rr"], kv[1]["total"]), default=("—",{}))[0]
    avg_rr=round(sum(float(t.get("rr",0) or 0) for t in trades)/len(trades),2) if trades else 0

    return jsonify({"total":len(trades),"active":len(active),"closed":len(closed),"wins":len(wins),"losses":len(losses),
        "win_rate":win_rate,"rr_total":round(sum(float(t.get("rr",0) or 0) for t in trades),2),"avg_rr":avg_rr,
        "tp1":len([t for t in trades if t.get("status")=="TP1 HIT"]),"tp2":len([t for t in trades if t.get("status")=="TP2 HIT"]),
        "tp3":len([t for t in trades if t.get("status")=="TP3 HIT"]),"sl":len(losses),
        "streak":streak,"best_pair":best_pair,"best_timeframe":best_tf,"pair_stats":pair_stats,"timeframe_stats":tf_stats,
        "recent":trades[:12], "profile_progress": _profile_progress(current_user())})

@app.get("/api/journal.csv")
@login_required
def journal_csv():
    trades=load_json(TRADES_FILE,{}).get(current_user(),[]); buf=io.StringIO(); w=csv.writer(buf)
    w.writerow(["time","symbol","tf","mode","direction","action","entry","sl","tp1","tp2","tp3","score","status","rr"])
    for t in trades:
        w.writerow([t.get("generated"),t.get("symbol"),t.get("timeframe"),t.get("mode"),t.get("direction"),t.get("action"),t.get("entry_value"),t.get("stop_loss"),t.get("tp1"),t.get("tp2"),t.get("tp3"),t.get("score"),t.get("status"),t.get("rr")])
    return Response(buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition":"attachment; filename=tekora_journal.csv"})


@app.get("/api/profile")
@login_required
def api_profile_get():
    profiles = load_json(PROFILE_FILE,{})
    default={"account_balance":5.0,"risk_per_trade_usdt":0.30,"target_profit_usdt":1.0,"target_balance":10.0,"month_target_note":"Protect capital. Grow slow.","owner_signature":"Tekora"}
    return jsonify(profiles.get(current_user(), default))

@app.post("/api/profile")
@login_required
def api_profile_save():
    data=request.get_json(force=True)
    profiles=load_json(PROFILE_FILE,{})
    def n(k,d):
        try: return round(max(0.0,float(data.get(k,d))),4)
        except Exception: return d
    profiles[current_user()]={
        "account_balance":n("account_balance",5.0),
        "risk_per_trade_usdt":n("risk_per_trade_usdt",0.30),
        "target_profit_usdt":n("target_profit_usdt",1.0),
        "target_balance":n("target_balance",10.0),
        "month_target_note":str(data.get("month_target_note","Protect capital. Grow slow."))[:240],
        "owner_signature":str(data.get("owner_signature","Tekora"))[:80],
        "updated_at":int(time.time())
    }
    save_json(PROFILE_FILE,profiles)
    return jsonify({"ok":True,"profile":profiles[current_user()]})

def _profile_progress(user):
    profiles=load_json(PROFILE_FILE,{})
    p=profiles.get(user,{"account_balance":5.0,"risk_per_trade_usdt":0.30,"target_balance":10.0})
    start=float(p.get("account_balance",5.0) or 5.0)
    risk=float(p.get("risk_per_trade_usdt",0.30) or 0.30)
    target=float(p.get("target_balance",10.0) or 10.0)
    trades=load_json(TRADES_FILE,{}).get(user,[])
    pnl=0.0; wins=losses=active=0
    for t in trades:
        st=str(t.get("status",""))
        if st=="SL HIT": pnl-=risk; losses+=1
        elif st=="TP1 HIT": pnl+=risk*1.0; wins+=1
        elif st=="TP2 HIT": pnl+=risk*1.8; wins+=1
        elif st=="TP3 HIT": pnl+=risk*2.6; wins+=1
        elif st in ["RUNNING","WAITING ENTRY"]: active+=1
    current=round(start+pnl,4)
    progress=100 if target<=start and current>=target else round(min(100,max(0,(current-start)/max(target-start,1e-9)*100)),1)
    return {"profile":p,"start_balance":start,"simulated_balance":current,"target_balance":target,"realized_pnl":round(pnl,4),"progress_pct":progress,"wins":wins,"losses":losses,"active":active,"completed":current>=target,"message":"DONE YOUR TARGET — congrats brooo 👑" if current>=target else "Keep going bro — protect capital first."}

@app.get("/api/profile/progress")
@login_required
def api_profile_progress(): return jsonify(_profile_progress(current_user()))

@app.get("/api/memory")
@login_required
def api_memory():
    try:
        from engine import get_signal_memory_report
        return jsonify(get_signal_memory_report())
    except Exception as e:
        return jsonify({"error":str(e)})


if __name__=="__main__": app.run(host="0.0.0.0", port=5000, debug=True)
