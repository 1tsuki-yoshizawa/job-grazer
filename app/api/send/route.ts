import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// 環境変数からサービスアカウントの認証情報を読み込む
const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

const GRAY_COLOR = {
    red: 0.3,
    green: 0.3,
    blue: 0.3,
};

// 🌟 修正ポイント: サーバー起動時に認証情報がない場合は明確にエラーを出す
if (!serviceAccountKey) {
    // 認証情報がない場合は、サーバー起動時にエラーを出す
    throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set."
    );
}

// 認証情報をパース
// 認証情報をパース
let parsedCredentials: any;
try {
    // -------------------------------------------------------------------
    // 🛠️ 修正ポイント: Base64デコードを試みる
    // .envファイルでの改行・特殊文字のエスケープ問題を回避するため、
    // 環境変数をBase64エンコードされたJSONと仮定します。
    const decodedKey = Buffer.from(serviceAccountKey, "base64").toString(
        "utf8"
    );
    parsedCredentials = JSON.parse(decodedKey);
    // -------------------------------------------------------------------
} catch (e) {
    // パース失敗時、エラーメッセージをより具体的に出力します
    console.error("Original parsing error:", e);
    throw new Error(
        "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON. Ensure the entire JSON content is correctly Base64 encoded in your .env.local file."
    );
}

export async function POST(request: NextRequest) {
    try {
        // 🌟 修正ポイント: sheetName をペイロードから取得
        const { extractedProjectIDs, googleSpreadSheetID, sheetName } =
            (await request.json()) as {
                extractedProjectIDs: string[];
                googleSpreadSheetID: string;
                sheetName: string; // 必須のパラメータとして追加
            };

        console.log("Extracted Project IDs:", extractedProjectIDs);
        console.log("Spreadsheet ID:", googleSpreadSheetID);
        console.log("Target Sheet Name:", sheetName); // 対象シート名を表示

        // 認証情報のセットアップ
        const auth = new google.auth.GoogleAuth({
            credentials: parsedCredentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        // --- 1. シート情報の取得 (指定されたシート名とシートIDの特定) ---
        // すべてのシートのタイトルとIDを取得
        const sheetMetadata = await sheets.spreadsheets.get({
            spreadsheetId: googleSpreadSheetID,
            fields: "sheets.properties.title,sheets.properties.sheetId",
        });

        // 🌟 修正ポイント: 指定されたシート名に一致するシートを探す
        const targetSheet = sheetMetadata.data.sheets?.find(
            (s) => s.properties?.title === sheetName
        );

        const sheetTitle = targetSheet?.properties?.title;
        const sheetId = targetSheet?.properties?.sheetId;

        if (!sheetTitle || sheetId === undefined) {
            return NextResponse.json(
                {
                    error: `Spreadsheet structure error: Sheet named "${sheetName}" could not be found.`,
                },
                { status: 400 }
            );
        }

        // --- 2. ヘッダーを読み込み、「案件ID」列のインデックスを見つける ---
        // 取得したシート名を使用
        const headerRange = `${sheetTitle}!1:1`;
        const headerResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: googleSpreadSheetID,
            range: headerRange,
        });

        const headerRow = headerResponse.data.values?.[0] || [];
        // ヘッダー名 "案件ID" に一致する列を探す
        const projectIDColumnIndex = headerRow.findIndex(
            (cell: string) => cell.trim() === "案件ID"
        );

        if (projectIDColumnIndex === -1) {
            return NextResponse.json(
                {
                    error: "The column '案件ID' was not found in the first row of the sheet.",
                },
                { status: 400 }
            );
        }

        // --- 3. 「案件ID」列全体を読み込む ---
        // 列インデックスからA1表記の列文字を取得 (0 -> A, 1 -> B, ...)
        const projectIDColumnLetter = String.fromCharCode(
            "A".charCodeAt(0) + projectIDColumnIndex
        );
        const projectIDRange = `${sheetTitle}!${projectIDColumnLetter}:${projectIDColumnLetter}`;

        const columnResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: googleSpreadSheetID,
            range: projectIDRange,
        });

        const projectIDColumn = columnResponse.data.values || [];
        const updateRequests: any[] = [];

        // --- 4. 照合と更新リクエストの構築 ---

        // i=0はヘッダーなのでスキップ。スプレッドシートの行番号は i + 1
        for (let i = 1; i < projectIDColumn.length; i++) {
            // columnResponseの各要素は配列の配列なので [i][0] で値を取得
            const rowValue = projectIDColumn[i]?.[0]?.trim();
            const rowNumber = i + 1; // スプレッドシート上の行番号 (2行目から開始)

            // 抽出されたIDリストに含まれるIDと完全に一致するか確認
            if (rowValue && extractedProjectIDs.includes(rowValue)) {
                // 🚀 修正: GridRangeの正しいフィールド名を使用
                updateRequests.push({
                    repeatCell: {
                        range: {
                            sheetId: sheetId,
                            // **修正ポイント**: dimension, startIndex, endIndex を削除し、
                            // GridRangeで期待される startRowIndex と endRowIndex に変更します。
                            startRowIndex: rowNumber - 1, // APIは0始まりの行インデックス
                            endRowIndex: rowNumber, // 終端は含まず (1行分)
                            // 列インデックスを省略することで、行全体に書式が適用されます。
                        },
                        cell: {
                            // 書式設定を適用するセルオブジェクト
                            userEnteredFormat: {
                                backgroundColor: GRAY_COLOR,
                            },
                        },
                        // 更新するフィールドを指定
                        fields: "userEnteredFormat.backgroundColor",
                    },
                });
            }
        }

        // --- 5. APIを実行し、一括で書式設定を更新する ---
        console.log("updateRequests.length", updateRequests.length);
        if (updateRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: googleSpreadSheetID,
                requestBody: {
                    requests: updateRequests,
                },
            });
            console.log(
                `Successfully greyed out ${updateRequests.length} rows in sheet "${sheetName}".`
            );
        } else {
            console.log(
                `No matching Project IDs found to grey out in sheet "${sheetName}".`
            );
        }

        return NextResponse.json(
            {
                success: true,
                message: `${updateRequests.length} rows were successfully updated in the Google Sheet: ${sheetName}.`,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("API Handler Error", error);
        const errorMessage =
            error instanceof Error
                ? error.message
                : "An unknown error occurred.";

        return NextResponse.json(
            { error: `API Error: ${errorMessage}` },
            { status: 500 }
        );
    }
}
