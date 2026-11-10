import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from kit import Svg, sequence, C, esc

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)
P = lambda n: os.path.join(OUT, n)


# 1. Architecture ------------------------------------------------------------
def architecture():
    s = Svg(1600, 880, "Cake shop architecture",
            "Customers and the baker reach CloudFront, which serves the two React apps from S3 and "
            "forwards API calls to API Gateway and Lambda. Orders are stored in DynamoDB; a stream "
            "triggers the notifier, which emails the customer through SES and alerts the baker "
            "through SNS. Failures land in a dead-letter queue watched by CloudWatch.",
            "How the cake shop fits together",
            "Two small React apps, five Lambda functions and one table. Serverless, so it costs pennies outside December.")
    # zones
    s.zone(296, 150, 270, 580, "Global edge", "sky")
    s.zone(590, 150, 954, 630, "eu-west-2 · London", "purple")
    s.zone(830, 192, 240, 392, "Lambda · Node.js arm64", "violet", fill_op=0.03)

    # people
    s.device(56, 170, 200, 250, "user", "Customer", "phone, tablet or desktop",
             [("sky", 150), ("sky", 110), ("coral", 130), ("lime", 90)])
    s.device(56, 470, 200, 250, "cake", "The baker", "admin portal, MFA",
             [("violet", 150), ("violet", 120), ("mango", 100), ("lime", 130)])

    # edge
    s.pill(316, 190, "sky", "sign", "Route 53", "DNS for the domain", w=230)
    s.node(320, 330, "sky", "globe", "CloudFront", ["HTTPS, headers", "60 s API cache"])
    s.pill(316, 486, "grey", "shield", "ACM certificate", "lives in us-east-1", w=230)

    # london column B
    s.node(615, 200, "sky", "bucket", "S3 bucket", ["private, OAC", "shop + admin apps"], w=190)
    s.node(615, 330, "sky", "api", "API Gateway", ["HTTP API", "throttled"], w=190)
    s.node(615, 600, "violet", "lock", "Cognito", ["admins only", "MFA required"], w=190)

    # lambdas
    lam = [("sky", "catalogue", "public, read only"), ("sky", "create-order", "public, validated"),
           ("violet", "admin-api", "JWT, admins group"), ("violet", "admin-export", "JWT, Excel file")]
    ys = [232, 312, 392, 472]
    for (c, t, l), y in zip(lam, ys):
        s.node(850, y, c, "lambda", t, [l], h=70)

    # column D / E
    s.node(1095, 330, "lime", "db", "DynamoDB", ["one table, PITR", "with Streams"], w=190)
    s.node(1095, 480, "mango", "lambda", "notifier", ["reads the stream", "sends the emails"], w=190)
    s.node(1340, 200, "coral", "mail", "SES", ["customer emails", "received, confirmed"], w=190)
    s.node(1340, 330, "mango", "bell", "SNS orders", ["new-order alert", "to the baker"], w=190)
    s.node(1340, 480, "grey", "queue", "SQS DLQ", ["failed emails", "kept 14 days"], w=190)

    # ops row
    s.node(850, 640, "grey", "coin", "Budgets", ["monthly cost cap"], w=200, h=70)
    s.node(1095, 640, "grey", "bell", "Ops alerts", ["SNS, by email"], w=190, h=70)
    s.node(1340, 640, "grey", "chart", "CloudWatch", ["logs and alarms"], w=190, h=70)

    # people -> edge
    s.path("M256 228 C286 228 290 218 314 218", "sky", dots=True)
    s.label(270, 206, "DNS", "sky")
    s.path("M256 330 C292 330 286 366 318 366", "sky")
    s.path("M256 560 C296 560 286 390 318 390", "violet")
    s.label(268, 470, "HTTPS", "mist", bg=True)
    s.path("M256 655 H613", "violet")
    s.label(440, 645, "sign in with MFA", "violet", bg=True)

    # edge -> london
    s.path("M420 486 V416", "grey", dots=True, head=False)
    s.label(430, 456, "certificate", "grey")
    s.path("M520 358 C568 358 566 242 613 242", "sky")
    s.label(566, 292, "/ and /admin/*", "sky", anchor="middle", bg=True)
    s.path("M520 384 C566 384 566 380 613 380", "sky")
    s.label(566, 410, "/api/*", "sky", anchor="middle", bg=True)
    s.path("M710 598 V416", "violet", dots=True)
    s.label(720, 520, "issues JWT", "violet")

    # api -> lambdas
    for (c, *_), y in zip(lam, ys):
        s.path(f"M805 372 C826 372 826 {y+35} 848 {y+35}", c)
    # lambdas -> db
    for (c, *_), y in zip(lam, ys):
        s.path(f"M1050 {y+35} C1072 {y+35} 1072 372 1093 372", c)
    s.badge(1072, 352, 1, "lime")
    s.label(1100, 318, "write order", "lime", bg=True)

    s.path("M1190 414 V478", "mango")
    s.badge(1190, 446, 2, "mango")
    s.label(1210, 451, "stream", "mango")

    s.path("M1285 500 C1316 500 1310 250 1338 250", "coral")
    s.badge(1312, 300, 3, "coral")
    s.path("M1285 512 C1318 512 1314 384 1338 384", "mango")
    s.badge(1318, 440, 4, "mango")
    s.path("M1285 540 H1338", "grey", dashed=True)
    s.label(1312, 580, "after retries", "grey", anchor="middle")

    s.path("M1435 564 V638", "grey", dashed=True)
    s.path("M1340 675 H1287", "grey")
    s.path("M1050 675 H1093", "grey")

    s.note(56, 772, "No card details anywhere", "lime",
           ["Payment is taken in person on collection,", "so the site never handles card data."])
    s.legend(56, 840, [("sky", "public shop"), ("violet", "admin portal"), ("lime", "order data"),
                       ("coral", "customer email"), ("mango", "baker alerts"), ("grey", "operations")],
             dashed="failure path")
    open(P("architecture.svg"), "w").write(s.render())


# 2. Order status ----------------------------------------------------------
def order_status():
    s = Svg(1600, 720, "Order status",
            "An order has two independent statuses. Fulfilment moves from New to Confirmed, Ready for "
            "collection and Collected, and can be cancelled before collection. Payment moves from "
            "Awaiting payment to Paid, and can be refunded.",
            "Two statuses per order",
            "Fulfilment and payment move separately, because the cake is paid for in person when it is collected.")
    s.zone(56, 150, 1488, 320, "Fulfilment status", "sky")
    xs = [120, 470, 820, 1170]
    steps = [("sky", "flag", "New", ["just placed"]), ("violet", "check", "Confirmed", ["the baker said yes"]),
             ("mango", "cake", "Ready", ["for collection"]), ("lime", "box", "Collected", ["order complete"])]
    for x, (c, i, t, l) in zip(xs, steps):
        s.node(x, 196, c, i, t, l, w=230)
    s.add('<circle cx="86" cy="238" r="9" fill="#FFFFFF"/>')
    s.path("M95 238 H118", "mist", head=True)
    for i in range(3):
        a, b = xs[i] + 230, xs[i + 1]
        s.path(f"M{a} 238 H{b-2}", steps[i + 1][0])
        s.badge((a + b) / 2, 238, i + 1, steps[i + 1][0])
    s.node(645, 360, "coral", "flag", "Cancelled", ["any time before", "collection"], w=230)
    for d in ("M235 280 C235 400 520 402 643 402", "M585 280 C585 320 700 320 700 358",
              "M935 280 C935 400 900 402 877 402"):
        s.path(d, "coral", dashed=True)
    s.label(1060, 410, "cancelling sends the customer an email", "coral")

    s.zone(56, 500, 1488, 150, "Payment status", "lime")
    pays = [("grey", "coin", "Awaiting payment", ["the default"]), ("lime", "coin", "Paid", ["recorded by the baker"]),
            ("coral", "coin", "Refunded", ["if it goes wrong"])]
    for x, (c, i, t, l) in zip(xs, pays):
        s.node(x, 540, c, i, t, l, w=230)
    s.add('<circle cx="86" cy="582" r="9" fill="#FFFFFF"/>')
    s.path("M95 582 H118", "mist")
    for i in range(2):
        a, b = xs[i] + 230, xs[i + 1]
        s.path(f"M{a} 582 H{b-2}", pays[i + 1][0])
    s.note(1170, 560, "Independent tracks", "mist", ["An order can be Ready and still", "awaiting payment."])
    s.legend(56, 690, [("sky", "new"), ("violet", "confirmed"), ("mango", "ready"), ("lime", "done or paid"),
                       ("coral", "cancelled or refunded")], dashed="cancel")
    open(P("order-status.svg"), "w").write(s.render())


# 3. Customer order journey -------------------------------------------------
def order_journey():
    parts = [("C", "Customer", "phone or desktop", "coral", "user"),
             ("CF", "CloudFront", "static shop", "sky", "globe"),
             ("API", "HTTP API", "throttled", "sky", "api"),
             ("CAT", "catalogue", "Lambda", "violet", "lambda"),
             ("ORD", "create-order", "Lambda", "violet", "lambda"),
             ("DB", "DynamoDB", "one table", "lime", "db")]
    msgs = [
        dict(a="C", b="CF", text="Open the shop", sub="React app from S3", kind="req", color="sky"),
        dict(a="C", b="API", text="GET /api/catalogue", sub="cached for 60 s", kind="req", color="sky"),
        dict(a="API", b="CAT", text="invoke", kind="req", color="sky"),
        dict(a="CAT", b="DB", text="read cakes, prices, dates", kind="req", color="lime"),
        dict(a="CAT", b="C", text="products, collection dates, deadline", kind="reply", color="sky"),
        dict(a="C", text="Choose cakes, size, date and add contact details", sub="then review the order and total", kind="note", color="coral"),
        dict(a="C", b="API", text="POST /api/orders", sub="with an idempotency key", kind="req", color="coral"),
        dict(a="API", b="ORD", text="invoke", sub="low rate, small burst", kind="req", color="coral"),
        dict(a="ORD", text="validate fields and honeypot", kind="self", color="violet"),
        dict(a="ORD", b="DB", text="read prices and date capacity", kind="req", color="lime"),
        dict(a="ORD", text="recalculate the total", sub="the browser's total is ignored", kind="self", color="violet"),
        dict(a="ORD", b="DB", text="one transaction", sub="order + key + date count + rate limit", kind="req", color="lime"),
        dict(text="Outcome", color="lime", kind="group", rows=3),
        dict(a="ORD", b="C", text="201: order received, ref KV-7K3QXM", kind="reply", color="lime"),
        dict(a="ORD", b="C", text="200: same key seen, original ref returned", kind="reply", color="mango"),
        dict(a="ORD", b="C", text="4xx: date full, past deadline or invalid", kind="reply", color="coral"),
    ]
    sequence(P("order-journey.svg"), "Customer order journey",
             "Sequence: the customer loads the catalogue, then places an order which is validated, "
             "re-priced on the server and written in one DynamoDB transaction.",
             "Placing an order",
             "The server re-prices every order and writes it in one transaction, so totals can't be tampered with and orders never double up.",
             parts, msgs, width=1600,
             legend=[("sky", "browse"), ("coral", "order"), ("violet", "Lambda work"), ("lime", "data")])


# 4. Admin flow -----------------------------------------------------------
def admin_flow():
    parts = [("A", "The baker", "admin portal", "mango", "cake"),
             ("CF", "CloudFront", "/admin/", "sky", "globe"),
             ("COG", "Cognito", "managed login", "violet", "lock"),
             ("API", "HTTP API", "JWT authorizer", "sky", "api"),
             ("ADM", "admin Lambdas", "api and export", "violet", "lambda"),
             ("DB", "DynamoDB", "one table", "lime", "db")]
    msgs = [
        dict(a="A", b="CF", text="Open /admin/", kind="req", color="sky"),
        dict(a="CF", b="A", text="admin app, no data inside", kind="reply", color="sky"),
        dict(a="A", b="COG", text="sign in: password + MFA code", sub="Authorization Code with PKCE", kind="req", color="violet"),
        dict(a="COG", b="A", text="short-lived tokens, kept in memory", kind="reply", color="violet"),
        dict(a="A", b="API", text="GET dashboard", sub="Bearer token", kind="req", color="mango"),
        dict(a="API", text="check signature, expiry, audience", sub="and the admins group", kind="self", color="violet"),
        dict(a="API", b="ADM", text="invoke", kind="req", color="mango"),
        dict(a="ADM", b="DB", text="query this season's orders", kind="req", color="lime"),
        dict(a="ADM", b="A", text="what to bake each day, totals, payments due", kind="reply", color="mango"),
        dict(a="A", b="API", text="PATCH status: Confirmed", kind="req", color="mango"),
        dict(a="ADM", b="DB", text="update with version check", sub="and add to the history", kind="req", color="lime"),
        dict(a="ADM", b="DB", text="The stream change makes the notifier send 'order confirmed'", kind="note", color="coral"),
        dict(a="A", b="API", text="GET orders.xlsx for a date", kind="req", color="mango"),
        dict(a="ADM", b="A", text="Excel download", kind="reply", color="lime"),
    ]
    sequence(P("admin-flow.svg"), "Admin portal flow",
             "Sequence: the baker signs in with MFA through Cognito, then loads the dashboard, "
             "confirms an order and downloads an Excel export through the JWT-protected API.",
             "Running the day from the admin portal",
             "Sign-in needs MFA, and every admin request is checked by API Gateway before a Lambda runs.",
             parts, msgs, width=1600,
             legend=[("sky", "static app"), ("violet", "sign-in and checks"), ("mango", "admin requests"), ("lime", "data"),
                     ("coral", "email follows")])


# 5. Customer email -------------------------------------------------------
def customer_email():
    parts = [("DB", "DynamoDB", "stream", "lime", "db"),
             ("N", "notifier", "Lambda", "mango", "lambda"),
             ("SES", "Amazon SES", "email", "coral", "mail"),
             ("C", "Customer", "inbox", "coral", "user"),
             ("Q", "SQS DLQ", "dead letters", "grey", "queue"),
             ("CW", "CloudWatch", "alarms", "grey", "chart")]
    msgs = [
        dict(a="DB", b="N", text="new ORDER item", sub="filtered stream event", kind="req", color="lime"),
        dict(a="N", text="build HTML and text email", kind="self", color="mango"),
        dict(a="N", b="SES", text="SendEmail", sub="Reply-To: the shop's address", kind="req", color="coral"),
        dict(text="Sent", color="lime", kind="group", rows=1),
        dict(a="N", b="DB", text="record SENT and message id", kind="reply", color="lime"),
        dict(text="SES error", color="coral", kind="group", rows=4),
        dict(a="N", b="DB", text="record FAILED and the error", kind="reply", color="coral"),
        dict(a="N", text="throw, so Lambda retries", sub="3 retries, backoff, bisect", kind="self", color="coral"),
        dict(a="N", b="Q", text="still failing: send to DLQ", kind="req", color="grey"),
        dict(a="Q", b="CW", text="alarm: messages waiting", kind="req", color="grey"),
        dict(a="SES", b="C", text="'Order received' email", kind="req", color="coral"),
        dict(a="SES", b="CW", text="bounces and complaints", sub="configuration set events", kind="req", color="grey"),
    ]
    sequence(P("customer-email.svg"), "Customer email flow",
             "Sequence: a new order on the DynamoDB stream triggers the notifier, which sends the "
             "customer an email through SES. Failures are retried, then sent to a dead-letter queue "
             "that raises a CloudWatch alarm.",
             "Emailing the customer",
             "Email is sent after the order is saved, so a slow mail server never loses an order.",
             parts, msgs, width=1600,
             legend=[("lime", "data"), ("mango", "notifier"), ("coral", "email"), ("grey", "failure handling")])


# 6. Internal alerts ------------------------------------------------------
def internal_alerts():
    parts = [("N", "notifier", "Lambda", "mango", "lambda"),
             ("T", "SNS topic", "order alerts", "mango", "bell"),
             ("M", "The baker", "inbox", "lime", "cake"),
             ("S", "Helper", "second inbox", "lime", "user")]
    msgs = [
        dict(a="N", b="T", text="publish 'New order KV-7K3QXM, 23 Dec'", kind="req", color="mango"),
        dict(a="T", b="M", text="email", kind="req", color="lime"),
        dict(a="T", b="S", text="same email", kind="req", color="lime"),
        dict(a="N", text="record SENT or FAILED", sub="same retry and DLQ path", kind="self", color="grey"),
    ]
    sequence(P("internal-alerts.svg"), "New-order alerts",
             "Sequence: the notifier publishes each new order to an SNS topic, which emails every "
             "subscribed address.",
             "Telling the baker about new orders",
             "One SNS topic, one email per subscriber. Adding someone is a confirmed subscription, not a code change.",
             parts, msgs, width=1200,
             legend=[("mango", "alert"), ("lime", "delivery"), ("grey", "bookkeeping")])


# 7. Stacks ---------------------------------------------------------------
def stacks():
    s = Svg(1600, 860, "CloudFormation stacks",
            "A bootstrap stack holds the artifacts bucket. An optional edge stack in us-east-1 holds "
            "the certificate. The root stack in eu-west-2 creates seven nested stacks: data, auth, "
            "messaging, api-gateway, frontend, backend and monitoring.",
            "Every resource, in plain CloudFormation",
            "One root stack per environment with seven nested stacks. Arrows show which outputs feed which stack.")
    s.zone(56, 150, 360, 250, "eu-west-2 · once per account", "grey")
    s.node(96, 200, "grey", "bucket", "kvc-bootstrap", ["artifacts bucket", "templates + zips"], w=280)
    s.zone(56, 440, 360, 250, "us-east-1 · only with a domain", "sky")
    s.node(96, 490, "sky", "shield", "kvc-env-edge", ["ACM certificate", "optional WAF"], w=280)

    s.zone(470, 150, 1074, 600, "eu-west-2 · kvc-env root stack", "purple")
    col1, col2, col3 = 510, 870, 1230
    s.node(col1, 210, "lime", "db", "data", ["DynamoDB table"], w=270)
    s.node(col1, 350, "violet", "lock", "auth", ["Cognito pool, domain,", "admins group"], w=270)
    s.node(col1, 490, "coral", "mail", "messaging", ["SNS, SES, DKIM records,", "dead-letter queue"], w=270)
    s.node(col1, 630, "sky", "api", "api-gateway", ["bare HTTP API", "breaks a cycle"], w=270)
    s.node(col2, 280, "sky", "globe", "frontend", ["bucket, CloudFront,", "Route 53 aliases"], w=270)
    s.node(col2, 520, "mango", "lambda", "backend", ["5 Lambdas, roles, routes,", "authorizer, stream"], w=270)
    s.node(col3, 520, "grey", "chart", "monitoring", ["CloudWatch alarms,", "AWS Budget"], w=270)

    s.path("M376 242 C430 242 430 300 468 300", "grey", dashed=True)
    s.label(392, 286, "templates", "grey", bg=True)
    s.path("M376 532 C430 532 430 480 468 480", "sky", dashed=True)
    s.label(392, 566, "certificate ARN", "sky", bg=True)

    # deps
    s.path(f"M780 252 C830 252 830 540 868 540", "lime")              # data -> backend
    s.path(f"M780 380 C825 380 825 310 868 310", "violet")            # auth -> frontend
    s.path(f"M780 400 C830 400 830 552 868 552", "violet")            # auth -> backend
    s.path(f"M780 532 H868", "coral")                                  # messaging -> backend
    s.path(f"M780 560 C1000 700 1150 700 1260 606", "coral")           # messaging -> monitoring
    s.path(f"M780 660 C835 660 830 340 868 340", "sky")               # api -> frontend
    s.path(f"M780 672 C840 672 840 590 868 586", "sky")               # api -> backend
    s.path(f"M1005 364 V518", "sky")                                    # frontend -> backend
    s.label(1015, 446, "site URL", "sky")
    s.path(f"M1140 562 H1228", "mango")                                # backend -> monitoring

    s.note(1230, 220, "Why a bare API stack?", "mist",
           ["frontend needs the API URL and", "backend needs the site URL.",
            "Creating the API on its own", "first breaks that loop."])
    s.legend(56, 820, [("lime", "data"), ("violet", "auth"), ("coral", "messaging"), ("sky", "web and API"),
                       ("mango", "backend"), ("grey", "operations")], dashed="passed in by deploy.sh")
    open(P("stacks.svg"), "w").write(s.render())


# 8. Delivery plan --------------------------------------------------------
def delivery_plan():
    s = Svg(1600, 420, "Delivery plan",
            "Six phases, each ending in an approval gate. Dev deploys after phase 2 is approved and "
            "production after phase 5.",
            "Six phases, each signed off",
            "Nothing moves on without an approval, and nothing reaches AWS without an explicit go-ahead.")
    phases = [("sky", "search", "Discovery", ["and architecture"]), ("violet", "layers", "Infrastructure", ["CloudFormation"]),
              ("mango", "laptop", "Application", ["shop and admin"]), ("coral", "mail", "Email", ["SES and SNS"]),
              ("lime", "shield", "Testing", ["and security"]), ("sky", "flag", "Production", ["and handover"])]
    gap = 248
    for i, (c, ic, t, l) in enumerate(phases):
        x = 56 + i * gap
        s.node(x, 180, c, ic, t, l, w=196)
        s.badge(x + 196 - 6, 186, i + 1, c)
        if i < 5:
            gx = x + 196 + 26
            s.path(f"M{x+196} 222 H{gx-14}", "mist", head=False)
            s.add(f'<rect x="{gx-12}" y="{222-12}" width="24" height="24" rx="5" transform="rotate(45 {gx} 222)" fill="#B8F23A"/>'
                  f'<use href="#i-check" x="{gx-9}" y="{213}" width="18" height="18"/>')
            s.path(f"M{gx+14} 222 H{x+gap-2}", "mist")
    s.label(56 + 248 + 196 + 26, 300, "+ OK to deploy dev", "lime", anchor="middle")
    s.label(56 + 4 * 248 + 196 + 26, 300, "+ OK to deploy prod", "lime", anchor="middle")
    s.add('<path d="M500 262 V284" stroke="#B8F23A" stroke-width="1.5" stroke-dasharray="3 4"/>'
          '<path d="M1244 262 V284" stroke="#B8F23A" stroke-width="1.5" stroke-dasharray="3 4"/>')
    s.legend(56, 380, [("lime", "approval gate")])
    open(P("delivery-plan.svg"), "w").write(s.render())


# 9. Excel export ---------------------------------------------------------
def excel_export():
    parts = [("A", "The baker", "admin portal", "mango", "cake"),
             ("API", "HTTP API", "JWT checked", "sky", "api"),
             ("X", "admin-export", "Lambda", "violet", "lambda"),
             ("DB", "DynamoDB", "GSI1", "lime", "db")]
    msgs = [
        dict(a="A", b="API", text="GET exports/orders.xlsx", sub="?collectionDate=2026-12-23&status=CONFIRMED", kind="req", color="mango"),
        dict(a="API", b="X", text="invoke", sub="token verified", kind="req", color="sky"),
        dict(a="X", b="DB", text="query by season and date", kind="req", color="lime"),
        dict(a="X", text="filter, sort by date then ref", kind="self", color="violet"),
        dict(a="X", text="build the workbook in memory", sub="exceljs", kind="self", color="violet"),
        dict(a="X", b="API", text="200, base64 .xlsx body", sub="Content-Disposition: attachment", kind="reply", color="lime"),
        dict(a="API", b="A", text="browser downloads the file", kind="reply", color="lime"),
    ]
    sequence(P("excel-export.svg"), "Excel export",
             "Sequence: the baker requests an Excel export; the admin-export Lambda queries DynamoDB, "
             "builds the workbook in memory and returns it as a download.",
             "Exporting orders to Excel",
             "The workbook is built on demand and never stored, so there are no stale files to tidy up.",
             parts, msgs, width=1280,
             legend=[("mango", "request"), ("sky", "API"), ("violet", "Lambda work"), ("lime", "data and file")])


for f in (architecture, order_status, order_journey, admin_flow, customer_email, internal_alerts,
          stacks, delivery_plan, excel_export):
    f()
print("ok")
