# Trip Planner — 上線設定指南

GitHub Pages 放畫面、Firebase 放資料與登入、PWA 負責離線與安裝到手機。

## 權限怎麼運作
- **只有你(擁有者)用 Google 登入。** 第一次登入時會用手機裡目前的資料建立你的旅程。
- 朋友**不用登入**:在 app 的「設定 → 我的旅程」,每一趟旅程右邊的連結圖示按一下,就會把**那一趟**的連結複製起來(圖示變成 Copied)。連結是一條短連結(例如 `https://你的網域/#j=K7M2Q9XD4F`),傳給朋友。朋友點開連結、輸入自己的名字,就加入旅程,而且**都可以編輯**。
- 朋友的 app 裡**沒有「設定」分頁**,也不能產生連結或管理成員。
- 設定頁的「People」會列出已加入的人(用他們輸入的名字),只有登入的擁有者能移除(Remove)。
- 連結沒有期限。要請走某個人,請在 People 按 Remove。
- 連結本身就是鑰匙,請只傳給你信任的人。連結裡的隨機字串有 10 碼(約 50 位元),無法被猜出來。

## 多趟旅程
- 「設定 → 我的旅程」列出你所有的旅程,目前這趟標「Current」,已經結束的標「Past」並排在下面,資料都保留,可以回顧。
- 點某一趟就切換過去(頁面會重新載入)。目前看哪一趟是記在每台裝置上,手機和電腦可以各自停在不同的旅程。
- 「我的旅程」標題右邊的「+ New」新增一趟空白旅程,最多 20 趟。
- 每一列:旅程名稱後面的淡色鉛筆可以改名稱(只改清單上的名稱,不影響總覽的目的地);右邊的連結圖示複製該趟的分享連結;**向左滑動**這一列刪除該趟(會先跳出確認,刪除後無法復原,連同照片、成員和分享連結都會移除)。
- 朋友沒有設定頁,所以不能自己切換旅程。他們點哪一趟的連結就切到哪一趟,之前加入的旅程再點一次連結就回得去。被你刪除的旅程,朋友下次打開會看到「這趟旅程已經不存在了」。

## 一、建立 Firebase 專案
1. https://console.firebase.google.com → Add project(Analytics 可以關掉)。
2. **Authentication → Sign-in method**:啟用 **Google** 和 **Anonymous**(兩個都要)。
3. **Authentication → Settings → Authorized domains**:加入你網站的網域(`你的帳號.github.io` 或你的自訂網域)。
4. **Firestore Database → Create database**(production mode,地區選 asia-east1 或 asia-northeast1)。
5. Firestore 的 **Rules** 分頁:把 `firestore.rules` 整份貼上 → **Publish**。**這次的規則又更新了(分享連結改用 `links`),已經部署過的人也要重新貼上並發布。**
6. **Project settings → Your apps → Web**:把 `apiKey`、`authDomain`、`projectId`、`appId` 填進 `firebase-config.js`(這些是公開設定,不是密碼)。

> Firebase 的免費額度和功能的方案要求會調整,正式使用前請到官方頁面確認。

## 二、部署到 GitHub Pages
1. 建一個 **public repo**,把這個資料夾裡的檔案全部上傳(包含 `icons/`)。
2. Settings → Pages → Deploy from a branch → `main` / `(root)`。
3. 之後更新:覆蓋上傳新檔案,把 `sw.js` 第一行的 `VERSION` 加一,使用者重新整理兩次就會拿到新版。

不要把 `my-trip-seed.json` 或任何個人行程資料上傳到 public repo。

## 三、手機使用
- iPhone:Safari → 分享 → **加入主畫面**。Android:Chrome → **安裝應用程式**。
- **沒登入、也不是從連結加入的人,只會看到鎖定畫面。** 從分享連結打開的人只會看到「輸入名字、加入」,不會看到 Google 登入。 真正的保護是 Firestore 規則。
- **iPhone 的主畫面 app 和 Safari 的登入是分開的。** 第一次打開要在鎖定畫面重新登入,或輸入名字並貼上連結。
- **畫面固定直式、不會縮放。** iPhone 無法由程式鎖定方向,橫放時會顯示「請轉回直式」的遮罩。
- **語言:** 設定頁標題右側可切換 English / 中文(朋友沒有設定頁,語言跟著手機的語言)。

## 照片與 GIF
- 照片會自動縮小,分成小段存進資料庫。行程頁 banner 可以放 GIF,上限 3 MB。
- 免費方案儲存空間有限(請見官方說明)。換掉的舊照片目前不會自動清除。

## 字型
中文的「行程、設定、待辦清單、想法、住宿、筆記、預約」標題使用源柔ゴシック(Gen Jyuu Gothic)Bold,SIL Open Font License 1.1,只內嵌了這 16 個字,約 6 KB。

## 本機測試
模組需要 http:在資料夾執行 `python3 -m http.server 8000`,開 http://localhost:8000。沒填 Firebase 設定時是「只存在這台裝置」模式。

## 已知取捨
- 兩個人同時改**同一個區塊**時,後存的會蓋掉先存的;改不同區塊互不影響。
- 目前一個帳號對應一趟旅程。
