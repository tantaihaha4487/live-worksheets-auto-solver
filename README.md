# live-worksheets-auto-solver

Auto solve LiveWorksheets from the browser console.

## Supported now

- dropdowns built from `choose:` fields
- drag and drop built from `drag:` and `drop:` fields
- join / match pairs built from `join:` fields
- click-to-select areas built from `select:yes` and `select:no`

Unsupported field types are reported in the console instead of stopping the run.

## How to use

1. Open a LiveWorksheets page.
2. Press `F12` and open the Console.
3. Open `liveworksheets-auto-solver.js` in this repo.
4. Paste the full file into the Console and press Enter.
5. Review the worksheet, then click `Finish` or `Check my answers`.

## Notes

- The script uses the worksheet data exposed in `drupalSettings.worksheet.json`.
- `choose:` dropdown fields are solved by the starred option index, which matches LiveWorksheets' saved state format.
- For drag/drop and join widgets it writes directly into the worksheet runtime state, then re-renders the page.
- If a worksheet uses a field type that is not supported yet, the script continues and reports the skipped items.
