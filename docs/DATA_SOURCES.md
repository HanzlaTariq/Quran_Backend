# Quran and Hadith data provenance

## No invented text

No Quran or Hadith dataset is fabricated or bundled with this source delivery. `npm run data:sync` downloads the selected public editions into `backend/data`. Missing data produces an actionable unavailable-library response instead of generated verses, invented translations or invented Hadith grades.

The source environment could read provider documentation through web research but could not perform outbound dataset downloads from the container. Therefore no claim is made that the actual provider payloads or audio were downloaded and end-to-end verified during delivery.

## Quran

Provider documentation: https://alquran.cloud/api

Selected whole-Quran endpoints:

```text
https://api.alquran.cloud/v1/quran/quran-uthmani
https://api.alquran.cloud/v1/quran/en.sahih
https://api.alquran.cloud/v1/quran/ur.jalandhry
```

The selected Arabic text is Uthmani. `en.sahih` is Sahih International English, and `ur.jalandhry` is Fateh Muhammad Jalandhry Urdu. The sync script checks 114 surahs and 6,236 ayahs for this provider's enumeration, plus alignment of global verse numbers across selected editions. This is a structural check, not a scholarly revalidation of every translation.

Alafasy recitation is requested using the provider CDN pattern:

```text
https://cdn.islamic.network/quran/audio/128/ar.alafasy/{globalAyahNumber}.mp3
```

The audio is streamed, not bundled. Availability depends on the provider/network. Search checks the saved source text and normalized Arabic/Urdu/Latin characters; normalization affects matching, not displayed scripture. A daily verse is chosen deterministically from the source dataset using the UTC date; it is not AI-generated or a religious recommendation.

## Hadith

Source repository and documentation: https://github.com/fawazahmed0/hadith-api

Selected edition files use the documented `editions` JSON structure from branch/tag path `1`, first via jsDelivr, then raw GitHub as fallback:

```text
https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{edition}.min.json
https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/{edition}.min.json
```

| Collection | Editions configured |
|---|---|
| Sahih al-Bukhari | `ara-bukhari`, `eng-bukhari`, `urd-bukhari` |
| Sahih Muslim | `ara-muslim`, `eng-muslim`, `urd-muslim` |
| Forty Hadith of an-Nawawi | `ara-nawawi`, `eng-nawawi` |

Availability and counts are calculated from the installed edition files, not hard-coded as proof of completeness. “Forty Hadith” is the collection title; editions may enumerate more than forty entries. No Nawawi Urdu edition is invented or silently substituted. Search returns text from the selected edition. Chapter names, Hadith references, numbering, transmitters/grades where provided remain source-dependent.

The interface does not assign a blanket authenticity grade to every record. It shows grades supplied by the edition and does not infer a grade where none is present. Numbering differs across editions and publishers; use the displayed source reference when citing a narration. Translations are not automatically aligned one-to-one across different Hadith editions.

## Manifest and updates

Successful sync writes source URLs, download timestamps and SHA-256 file hashes to a local manifest. Files are written via temporary files and renamed individually. A failed refresh can leave some new files and some old files; the entire library is not updated in a database transaction. Re-run sync to complete a consistent refresh. The current command downloads all selected editions again on each run.

The reference path `1` can evolve at the provider. For reproducible institutional releases, retain the downloaded files and manifest, review the edition content and pin a reviewed source revision in the sync script. A matching hash establishes file identity relative to the manifest, not religious authenticity.

## Rights and attribution

Review the current Al Quran Cloud terms and the Hadith repository's license/attribution before hosting or redistributing the downloaded editions. Repository licensing does not by itself settle every underlying translation or audio right. The app keeps collection and edition references visible, and this document retains provider URLs. No provider logo or bundled font file is included.

External services also include optional Google Fonts, a STUN endpoint and operator-configured SMTP/TURN. Their network availability, terms, privacy behavior and deployment suitability should be reviewed separately.
