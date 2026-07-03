import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.shared.services import google_sheet_service as gsheet
from app.core.config import settings

def main():
    try:
        service = gsheet.get_sheets_service()
        sid = settings.google_spreadsheet_id
        
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid,
            range="'seeding_content_kpi'!A1:J10",
            majorDimension="ROWS"
        ).execute().get("values", [])
        
        with open("storage/test_sheets_output.txt", "w", encoding="utf-8") as f:
            f.write("seeding_content_kpi rows:\n")
            for idx, row in enumerate(raw):
                f.write(f"Row {idx}: {row}\n")
        print("Success! Output written to storage/test_sheets_output.txt")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
