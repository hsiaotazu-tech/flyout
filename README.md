# Trip Planner — 上線設定指南

GitHub Pages 放畫面、Firebase 放資料與登入、PWA 負責離線與安裝到手機。

## 權限怎麼運作
- **只有你(擁有者)用 Google 登入。** 第一次登入時會用手機裡目前的資料建立你的旅程。
- 在 app 右上角的雲朵圖示裡產生 **Edit link(可編輯)** 或 **View link(只能看)**。
- 拿到連結的人**不用登入**:打開連結時,系統會自動給他一個匿名身分並加入旅程。
- 在「Links & people」可以撤銷連結(Revoke)、移除某個人(Remove)。撤銷連結只會讓新的人無法加入,**已經加入的人要另外按 Remove**。
- 連結本身就是鑰匙,請只傳給你信任的人。如果外流,撤銷它再產生新的。

## 一、建立 Firebase 專案(約 10 分鐘)
1. 到 https://console.firebase.google.com → Add project(Google Analytics 可以關掉)。
2. **Build → Authentication → Get started → Sign-in method**:啟用 **Google** 和 **Anonymous**(兩個都要)。
3. **Authentication → Settings → Authorized domains**:加入 `你的帳號.github.io`。
4. **Build → Firestore Database → Create database**:選 production mode,地區選離你近的(例如 asia-east1 或 asia-northeast1)。
5. Firestore 的 **Rules** 分頁:把 `firestore.rules` 的內容整份貼上 → **Publish**。(這一步最重要,沒貼等於沒有權限保護。)
6. **Project settings(齒輪)→ Your apps → Web(</>)**:註冊一個 web app,把它給的 `apiKey`、`authDomain`、`projectId`、`appId` 填進 `firebase-config.js`。這些值是公開的,不是密碼。

> Firebase 的免費額度和各項功能的方案要求會調整,正式使用前請到官方頁面確認。

## 二、部署到 GitHub Pages
1. 在 GitHub 建一個**新的 public repo**(例如 `trip-planner`),把這個資料夾裡的檔案全部上傳(包含 `icons/` 和 `.nojekyll`)。
2. Repo → **Settings → Pages** → Source 選 **Deploy from a branch** → Branch 選 `main`、資料夾 `/ (root)` → Save。
3. 等一兩分鐘,網址會是 `https://你的帳號.github.io/trip-planner/`。

**不要把 `my-trip-seed.json` 上傳到 repo**(裡面有你的航班和訂位資料,`.gitignore` 已經排除它)。公開 repo 裡只有空白範本。

## 三、第一次使用
1. 打開網站 → 右上角雲朵圖示 → **Sign in** → 用 Google 登入。
2. 登入後再點雲朵 → **Import** → 選 `my-trip-seed.json`,你的 Boston 行程就會進到雲端。
3. 雲朵 → **Edit link** 產生連結傳給朋友。

## 四、安裝到手機(PWA)
- iPhone:用 Safari 開網站 → 分享 → **加入主畫面**。
- Android:Chrome → 選單 → **安裝應用程式**。
- 離線時可以開啟並編輯,恢復連線後會自動同步。

## 本機測試
模組需要 http,不能直接雙擊 index.html。在資料夾裡執行 `python3 -m http.server 8000`,再開 http://localhost:8000。沒填 Firebase 設定時是「只存在這台裝置」模式。

## 改版後更新
改完檔案推上 GitHub 後,把 `sw.js` 第一行的 `VERSION` 加一(例如 `trip-v2`),使用者重新整理兩次就會拿到新版。

## 限制與已知取捨
- **同步方式:** 每一天、每一個區塊(Ideas、Checklist、Notes…)各存成一份文件。兩個人同時改**同一個區塊**時,後存的會蓋掉先存的;改不同區塊互不影響。
- **照片:** 會自動縮小(banner 寬 900px、idea 寬 520px)並存在資料庫裡。單一區塊上限約 1MB,Ideas 大約放 20 張照片就會滿;滿了會提示。要放更多照片需要改用 Firebase Storage(請先確認方案)。
- **iPhone 已安裝的 PWA 裡 Google 登入若跳不出來:** 擁有者請先在 Safari 分頁登入。朋友用連結加入則不受影響。
- **登出後** 這台裝置上的快取不會立刻清除,公用裝置請注意。
- 目前一個帳號對應一趟旅程。要支援多趟旅程需要再加切換功能。
