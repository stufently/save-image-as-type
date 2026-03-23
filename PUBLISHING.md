# Publishing Flow

## Chrome Web Store (First Publication)

1. Go to [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item** → Upload `save-image-as-type-1.0.0.zip` from [GitHub Releases](https://github.com/stufently/save-image-as-type/releases)
3. Fill in the listing:
   - **Name**: auto-filled from manifest (`Save Image As PNG, JPG, WebP, AVIF — Image Converter`)
   - **Description**: copy from `store/description.txt`
   - **Category**: Photos (or Productivity)
   - **Language**: English (localized descriptions auto-applied from `_locales/`)
   - **Screenshots**: upload 5 PNGs from `store/screenshots/mockup1-5.png`
   - **Small promo tile** (440x280): optional, can add later
   - **Marquee** (1400x560): optional, can add later
4. Privacy tab:
   - **Single purpose**: Convert and save images in different formats
   - **Permissions justification**: see `README.md` Permissions table
   - **Privacy policy URL**: `https://github.com/stufently/save-image-as-type/blob/master/PRIVACY.md`
   - **Data usage**: does NOT collect any user data (check all "No")
5. Click **Submit for Review** (typically 1-3 business days)

## Edge Add-ons (First Publication)

1. Go to [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. Register as developer (free, can sign in with GitHub)
3. Click **Create new extension** → Upload the same ZIP
4. Fill in listing (can customize name/description for Edge SEO)
5. Privacy policy URL: same GitHub link
6. Submit for review (1-7 days)

## Opera Add-ons (First Publication)

1. Go to [Opera Developer](https://addons.opera.com/developer/)
2. Create Opera account
3. Upload the same ZIP
4. Fill in listing
5. Submit for review (2-10 days)

## Updating (All Stores)

1. Update version in `extension/manifest.json` (e.g., `1.0.0` → `1.0.1`)
2. Commit: `git commit -am "Bump version to 1.0.1"`
3. Tag and push:
   ```bash
   git tag v1.0.1
   git push && git push --tags
   ```
4. GitHub Actions builds ZIP and creates Release automatically
5. Download ZIP from [Releases](https://github.com/stufently/save-image-as-type/releases)
6. Upload new ZIP to each store dashboard

## Re-generating Screenshots

```bash
docker run --rm \
  -v $(pwd)/store/screenshots:/app -w /app \
  node:20-bookworm \
  bash -c "apt-get update -qq && apt-get install -y -qq chromium > /dev/null 2>&1 && \
  npm install puppeteer-core > /dev/null 2>&1 && node capture.js"
```

Edit `store/screenshots/mockup*.html` to change screenshot content, then re-run the command above.
