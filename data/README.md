# Real source data
Run `npm run data:sync` with internet access before using the Quran/Hadith library.
This downloads all 114 surahs (Arabic Uthmani, Sahih International English, Jalandhry Urdu)
and Arabic/English/Urdu editions of Sahih al-Bukhari and Sahih Muslim, plus Arabic/English
Forty Hadith of an-Nawawi. No Urdu Nawawi translation is invented when the source lacks it.

Data stays on the backend. A manifest records URLs, SHA-256 checksums and download time.
Library pages explicitly report missing data; they never substitute generated scripture.
Verify editions and redistribution rights with the source providers before commercial use.
Source text is preserved exactly. Search normalization does NOT change displayed text.
