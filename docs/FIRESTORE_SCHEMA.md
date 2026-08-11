# Firestore スキーマ・Security Rules・Indexes

この文書は、現在の `src/lib/sales/types.ts`、`src/lib/sales-repository.ts`、`src/lib/auth-context.tsx`、`scripts/seed.ts`、`firestore.rules`、`firestore.indexes.json` を基準にしています。将来案と実装済みの構造を混同しないため、未使用・予約コレクションは明記します。

## 基本方針

- トップレベルコレクションを `organizationId` で分離するマルチテナント構成
- 店舗範囲は `locationId` と `users.allowedLocationIds` で制御
- 主要エンティティは `id`、`organizationId`、`locationId`、`createdAt`、`createdBy`、`updatedAt`、`updatedBy` を持つ
- アプリのドメイン層では日時を ISO 文字列として扱う。新規テナント初期化は `serverTimestamp()` を使うため、Rules は Firestore Timestamp と ISO 文字列の両方を受け入れる
- 金額は整数円、税率は basis points（`1000 = 10%`）
- 売上明細は `sales.items[]` に埋め込み、取引単位の読取と監査を一体化
- 物理削除は許可せず、有効／無効、取消、返金で履歴を残す
- Firestore 書込では、対象ドキュメントと監査ログを同一バッチに含める

## コレクション一覧

| コレクション | 用途 | 現在の画面で購読 | クライアント書込 |
| --- | --- | :---: | --- |
| `organizations` | 組織・テナント | 個別取得／購読 | 初期作成、管理者更新 |
| `users` | Auth UID と組織・ロール・許可店舗の対応 | 認証時に個別取得 | 初期自己作成、本人の限定プロフィール更新 |
| `locations` | 店舗マスタ | ✓ | 管理者 |
| `staff` | 担当者マスタ | ✓ | 管理者 |
| `customers` | 顧客マスタと購入指標 | ✓ | 管理者・マネージャー |
| `categories` | 商品カテゴリ | ✓ | 管理者。管理 UI は未実装 |
| `products` | 商品・サービス | ✓ | 管理者・マネージャー |
| `paymentMethods` | 支払方法 | ✓ | 初期作成、管理者。管理 UI は未実装 |
| `sales` | 売上ヘッダーと埋め込み明細 | ✓ | 管理者・マネージャー・一般（範囲制御あり） |
| `saleItems` | seed が作る平坦明細 | — | 不可。Admin SDK seed のみ |
| `goals` | 組織・店舗・担当者の月間／年間目標 | ✓ | 管理者 |
| `settings` | 通貨、ロケール、税丸め等 | 認証初期化のみ。業務画面の保存 UI は未実装 | 初期作成、管理者 |
| `auditLogs` | 追記専用監査ログ | ✓ | 対象書込と同一バッチの create のみ |
| `dailySummaries` | 日次・店舗別 seed 集計 | — | 不可。Admin SDK seed のみ |
| `monthlySummaries` | 月次・店舗別 seed 集計 | — | 不可。Admin SDK seed のみ |
| `dimensionSummaries` | 将来の軸別集計用予約 | — | 不可 |
| `operationLocks` | 将来の処理ロック用予約 | — | 読取・書込とも不可 |
| `saleCounters` | 将来の連番用予約 | — | 読取・書込とも不可 |

`saleItems`、日次・月次集計は Admin SDK が Security Rules を迂回して投入します。通常のブラウザ操作では更新されません。

## 共通フィールド

```ts
interface AuditableEntity {
  id: string;
  organizationId: string;
  locationId: string; // 組織共通は "all"
  createdAt: string | Timestamp;
  createdBy: string;
  updatedAt: string | Timestamp;
  updatedBy: string;
}
```

Firestore Repository が監査対象ドキュメントを書き込むときは `lastAuditId` も付加します。これは TypeScript の公開ドメイン型には含めず、Rules が同一バッチ内の `auditLogs/{lastAuditId}` と対応付けるための Firestore 専用フィールドです。

## エンティティ

### `organizations/{organizationId}`

| フィールド | 内容 |
| --- | --- |
| 共通フィールド | `locationId` は `all` |
| `name` | 組織名 |
| `ownerId` | 初期管理者 Auth UID |
| `timezone` | 現在は `Asia/Tokyo` |
| `currency` | `JPY` |
| `taxRoundingMode` | `floor` |
| `isActive` | 組織の有効状態 |
| `isDemo` | seed 組織かどうか |

### `users/{uid}`

| フィールド | 内容 |
| --- | --- |
| `id`, `userId` | Firebase Auth UID と一致 |
| `organizationId` | 所属テナント |
| `locationId` | 主所属店舗 |
| `allowedLocationIds[]` | 閲覧・操作可能店舗 |
| `staffId?` | 担当者マスタとの対応。一般ユーザーの自己売上判定に使用 |
| `name`, `displayName`, `email` | 表示プロフィール |
| `role` | `admin` / `manager` / `user` / `viewer` |
| `isActive` | ログイン後のデータアクセス可否 |
| 監査フィールド | 作成・更新者と日時 |

現在の Rules は本人による `name`、`displayName`、`email` の更新だけを許可し、`role`、組織、店舗、許可店舗、有効状態の変更を拒否します。管理者向けの実ユーザー招待・権限変更 UI は未実装です。

### `locations/{locationId}`

`code`、`name`、`address`、`phone`、`isActive` と共通フィールドを保持します。自身の `locationId` はドキュメント ID と同じです。

### `staff/{staffId}`

`name`、`email`、`department`、`title`、`role`、`monthlySalesTargetYen`、`isActive` と共通フィールドを保持します。`staff.role` は担当者マスタの属性で、`users.role` を自動更新しません。

### `customers/{customerId}`

| フィールド | 内容 |
| --- | --- |
| `name` | 顧客名 |
| `customerType` | `individual` / `corporate` |
| `phone`, `email` | 連絡先 |
| `registeredAt` | 登録日時 |
| `lastPurchaseAt?` | 最終購入日時 |
| `purchaseCount` | 認識済み購入回数 |
| `totalSalesYen` | 累計純売上 |
| `averagePurchaseYen` | 平均購入金額 |
| `tags[]` | 最大 30 件を Rules で許可 |
| `isActive` | 有効状態 |

新規作成時、購入指標は 0 でなければ Rules が拒否します。更新時もブラウザから購入指標を変更できません。画面表示時は閲覧可能な購読中売上から派生値を再計算し、デモ Repository は売上操作後にローカルデータへも反映します。Firebase モードで Firestore 上の購入指標を永続更新する Cloud Functions / サーバージョブは現在未実装です。

### `categories/{categoryId}`

`code`、`name`、`isActive`、`sortOrder` と共通フィールドを保持します。

### `products/{productId}`

| フィールド | 内容 |
| --- | --- |
| `code`, `name`, `description` | 識別・表示情報 |
| `productType` | `product` / `service` |
| `categoryId` | カテゴリ ID |
| `priceYen`, `costYen` | 販売価格・原価の整数円 |
| `taxRateBps` | `0..10000` |
| `isActive` | 無効化後も過去明細は保持 |

Rules は `costYen <= priceYen` も検証します。

### `paymentMethods/{paymentMethodId}`

`code`、`name`、`sortOrder`、`isActive` と共通フィールドを保持します。初期値は現金、クレジットカード、QR コード決済、電子マネー、銀行振込、その他です。

### `sales/{saleId}`

```ts
interface Sale {
  id: string;
  organizationId: string;
  locationId: string;
  transactionNumber: string;
  soldAt: string | Timestamp;
  customerId: string;
  customerName: string;       // 取引時点の表示名
  staffId: string;
  staffName: string;          // 取引時点の表示名
  items: SaleItem[];          // 1..2件
  subtotalYen: number;
  discountYen: number;
  taxableAmountYen: number;
  taxYen: number;
  totalYen: number;
  refundedAmountYen: number;
  paymentMethodId: string;
  paymentMethodName: string;  // 取引時点の表示名
  saleType: "retail" | "service" | "subscription" | "other";
  status: "confirmed" | "pending" | "cancelled" | "refunded" | "partially_refunded";
  memo: string;
  cancelledAt?: string | Timestamp;
  cancelledBy?: string;
  cancellationReason?: string;
  lastAuditId: string;        // Firestore書込時
  // 共通監査フィールド
}
```

売上作成時のステータスは `confirmed` または `pending`、返金額は 0 に限定されます。通常編集ではステータス維持、または `pending -> confirmed` だけを許可します。取消・返金は管理者専用の遷移です。

### 埋め込み `sales.items[]`

| フィールド | 内容 |
| --- | --- |
| 共通フィールド | 売上と同じ組織・店舗を保持 |
| `saleId` | 親売上 ID |
| `productId`, `productName`, `productCode` | 商品参照と取引時点スナップショット |
| `categoryId`, `productType` | 分析軸 |
| `quantity` | 1〜10,000 の整数 |
| `unitPriceYen`, `unitCostYen` | 単価・原価 |
| `subtotalYen` | 数量 × 単価 |
| `discountYen` | 明細割引 |
| `taxableAmountYen` | 小計 − 割引 |
| `taxRateBps` | 税率 basis points |
| `taxYen` | 明細単位で切り捨てた税 |
| `totalYen` | 課税対象 + 税 |

TypeScript の `calculateSaleItemAmounts` が式を計算し、Repository が入力済み集計値を再計算して保存します。Rules も各明細について `小計 = 数量 × 単価`、`課税対象 = 小計 − 割引`、`税 = floor(課税対象 × taxRateBps / 10,000)`、`合計 = 課税対象 + 税` を再計算し、最大 2 明細の小計・割引・税が親取引の各合計と一致することを検証します。

### `goals/{goalId}`

`targetType`（`organization` / `location` / `staff`）、`targetId`、`periodType`（`monthly` / `yearly`）、`periodKey`（`YYYY-MM` / `YYYY`）、`targetYen`、`isActive` と共通フィールドを保持します。

### `settings/{organizationId}`

`systemName`、`locale`、`timezone`、`currency = JPY`、`taxRoundingMode = floor`、`defaultTaxRateBp = 1000`、`fiscalYearStartMonth = 1` と共通フィールドを保持します。

### `auditLogs/{auditId}`

| フィールド | 内容 |
| --- | --- |
| `action` | `create` / `update` / `cancel` / `refund` / `permission_change` / `settings_change` |
| `entityType` | `sale` / `product` / `customer` / `goal` / `staff` / `location` / `settings` |
| `entityId` | 対象 ID |
| `actorName` | 操作者表示名 |
| `summary` | 日本語の操作要約 |
| `before?`, `after?` | 変更前・変更後スナップショット |
| 共通フィールド | 組織、店舗、作成・更新者と日時 |

`permission_change` は将来のユーザー権限管理用に action 値だけを予約しています。現在の `AuditedEntityType` に `user` はなく、実ユーザー招待・権限変更 UI も未実装なので、現行画面からこの action は生成しません。

Firestore Repository は次の一組をバッチ書込します。

```text
sales/{saleId}.lastAuditId = auditId
auditLogs/{auditId}.entityType = "sale"
auditLogs/{auditId}.entityId = saleId
auditLogs/{auditId}.createdBy = request.auth.uid
```

Rules は `getAfter()` で相互参照を検証します。監査ログだけ、または対象だけの単独書込は拒否されます。監査ログは作成後の更新・削除を許可しません。

更新監査ログの `before.updatedAt` は、書込直前の対象ドキュメントの `updatedAt` と一致する必要があります。Rules がこの比較交換（CAS）条件を検証するため、別セッションが先に更新した古い版からの上書きを拒否します。Firestore Repository は失敗時に最新値を再取得し、競合と判定できた場合は日本語メッセージへ変換します。

### `dailySummaries` / `monthlySummaries`

seed は `organizationId + locationId + 日/月` を固定 ID にし、次を保存します。

- `date` または `month`
- `grossSalesYen`
- `netSalesYen`
- `refundYen`
- `transactionCount`
- 共通監査フィールド

現在の画面はこれらを読みません。通常操作に追従する更新処理も未実装です。

## Repository の読取戦略

Firestore Repository は組織 ID を必須条件にし、管理者以外は店舗条件を追加します。一般ユーザーの売上クエリには `staffId == users.staffId` も追加します。

| データ | 1 購読あたりの上限 |
| --- | ---: |
| locations | 50 |
| staff | 100 |
| customers | 1,000 |
| categories | 200 |
| products | 1,000 |
| paymentMethods | 50 |
| sales | 1,000 |
| goals | 500 |
| auditLogs | 500 |

非管理者の `locationId in (...)` は Firestore の制約に合わせ、売上以外の共通マスタでは `all` を加えて最大 30 値、実店舗は最大 29 件として実装しています。現在はカーソルページネーションではなく、上限内のスナップショットをブラウザで検索・集計します。

## Security Rules の権限表

すべて `activeUser()`、同一組織、許可店舗の条件を前提とします。

| 対象 | read | create | update | delete |
| --- | --- | --- | --- | --- |
| organizations | 同一組織 | 初回 bootstrap | 管理者 | 不可 |
| users | 本人、同一組織の管理者・マネージャー | 初回本人 bootstrap | 本人の限定プロフィール | 不可 |
| locations / staff | 許可スコープ | 管理者 | 管理者 | 不可 |
| sales | 管理者・マネージャー・閲覧のみ。一般は自己売上 | 管理者・マネージャー・一般 | 通常編集は管理者・マネージャー・自己売上の一般。取消・返金は管理者 | 不可 |
| products / customers | 許可スコープ | 管理者・マネージャー | 管理者・マネージャー | 不可 |
| goals / categories | 許可スコープ | 管理者 | 管理者 | 不可 |
| paymentMethods / settings | 許可スコープ | 初回 bootstrap または管理者 | 管理者 | 不可 |
| auditLogs | 管理者・マネージャー | 対象変更と同一バッチ | 不可 | 不可 |
| saleItems / summaries | 許可スコープ | 不可 | 不可 | 不可 |
| operationLocks / saleCounters | 不可 | 不可 | 不可 | 不可 |

### 売上ステータス遷移

| 遷移 | 条件 |
| --- | --- |
| `pending -> confirmed` | 通常編集権限 |
| `pending -> cancelled` | 管理者、理由・取消者・取消日時必須 |
| `confirmed -> cancelled` | 管理者、返金額 0、理由必須 |
| `confirmed -> partially_refunded` | 管理者、`0 < 返金累計 < 合計` |
| `confirmed -> refunded` | 管理者、`返金累計 = 合計` |
| `partially_refunded -> partially_refunded/refunded` | 管理者、返金累計が直前より必ず増加 |
| `cancelled` / `refunded` からの変更 | 不可 |

## 複合インデックス

`firestore.indexes.json` に次を定義しています。

| コレクション | フィールド |
| --- | --- |
| sales | `organizationId ASC`, `soldAt DESC` |
| sales | `organizationId ASC`, `locationId ASC`, `soldAt DESC` |
| sales | `organizationId ASC`, `staffId ASC`, `soldAt DESC` |
| customers | `organizationId ASC`, `lastPurchaseAt DESC` |
| dailySummaries | `organizationId ASC`, `date ASC` |

現在の Repository は `orderBy` を付けず上限付き購読を行い、画面側でソートします。上記は日付順の Firestore クエリや将来の集計読取に備えた定義です。

## Rules テスト

```bash
npm run test:rules
```

Firestore Emulator 上の 22 ケースで次を検証します。

1. 未認証・他組織の読取拒否
2. 閲覧のみユーザーの書込拒否
3. 一般ユーザー用自己売上クエリの許可と広すぎるクエリの拒否
4. 一般ユーザーによる担当売上の作成・編集と他担当売上の拒否
5. 正しい売上と監査ログの同一バッチ成功
6. 売上に対する `locationId = all` の拒否
7. 監査ログを欠く売上書込の拒否
8. 別対象へ結び付けた監査ログの拒否
9. 旧 seed 売上への初回監査バインド
10. 正当な数量・金額編集と古い版からの上書き拒否
11. 登録済み売上の店舗変更拒否
12. 4 売上・4 監査ログの CSV 取込相当バッチ成功
13. 不正・内部不整合の金額拒否
14. 数量 × 単価または明細別切捨て税を偽装した書込の拒否
15. ライフサイクル項目だけを変える取消の許可と、同時金額改ざんの拒否
16. 一部返金から全額返金までの返金累計単調増加
17. `organizationId` 改ざんの拒否
18. 取消済み売上の編集・再開拒否
19. 一般ユーザーの自己ロール昇格拒否
20. 監査ログ付き商品作成
21. 監査ログ付き設定変更
22. 初回組織 bootstrap の一括成功

## 現在のスケール境界と拡張方針

- 画面集計は最大 1,000 売上のクライアント集計
- `dailySummaries` / `monthlySummaries` は seed 時点のスナップショットで、継続更新なし
- 顧客購入指標を Firebase 売上変更へ追従させる信頼済みサーバー処理なし
- 売上 CSV 取込は Security Rules の式評価上限に合わせて 4 売上ずつ commit し、ファイル全体では原子的でない
- `dimensionSummaries`、`operationLocks`、`saleCounters` は予約のみ

実運用規模へ拡張する場合は、Cloud Functions / Cloud Run で売上・顧客・日次・月次・軸別集計をトランザクション更新し、画面を集計ドキュメントとカーソルページネーションへ切り替える設計を想定しています。
