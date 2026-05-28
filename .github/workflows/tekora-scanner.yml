name: Tekora Scanner

on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:

jobs:
  run-scanner:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install requirements
        run: |
          pip install -r requirements.txt

      - name: Run Tekora Scanner
        run: |
         python scanner.py
