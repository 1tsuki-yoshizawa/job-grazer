"use client";

import { useState, ChangeEvent, FormEvent, useRef } from "react";
import Papa from "papaparse";

interface FormDataState {
    file: File | null;
    url: string;
    error: string | null;
    projectIDList: string[] | null;
}

export default function Home() {
    const [formData, setFormData] = useState<FormDataState>({
        file: null,
        url: "",
        error: null,
        projectIDList: null,
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const checkFileFormat = (file: File) => {
        return file.type === "text/csv" || file.name.endsWith(".csv");
    };

    const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, url: e.target.value });
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;

        if (file) {
            setFormData({ ...formData, file: file, error: null });
        }
    };

    /**
     * PapaParseを使用してCSVファイルから「案件ID」を抽出する
     */
    const extractProjectIDs = (file: File): Promise<string[]> => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true, // 1行目をヘッダーとして扱い、オブジェクトの配列で返す
                skipEmptyLines: true,
                encoding: "Shift_JIS", // 日本語CSVのデファクトスタンダードであるShift_JISを試行

                complete: (results) => {
                    // results.dataは Record<string, any>[] 型
                    const data = results.data as Record<string, any>[];

                    if (!data || data.length === 0) {
                        // パースが成功したがデータが空の場合
                        reject(
                            new Error(
                                "CSV file is empty or could not be parsed."
                            )
                        );
                        return;
                    }

                    // ヘッダー名 "案件ID" を探す（trim()で前後の空白を除去）
                    const headerKeys = Object.keys(data[0]);
                    const projectIDKey = headerKeys.find(
                        (key) => key.trim() === "案件ID"
                    );

                    if (!projectIDKey) {
                        reject(
                            new Error(
                                "CSV file does not contain a column named '案件ID'. Please ensure the header is correct."
                            )
                        );
                        return;
                    }

                    // 「案件ID」列の値を全て抽出し、空文字列をフィルタリング
                    const projectIDList = data
                        .map((row) =>
                            row[projectIDKey]
                                ? String(row[projectIDKey]).trim()
                                : ""
                        )
                        .filter((id) => id);

                    resolve(projectIDList);
                },
                error: (error) => {
                    // パースエラー発生時
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                },
            });
        });
    };

    const sendForm = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!formData.file) {
            setFormData({
                ...formData,
                error: "File is not selected.",
            });
            return;
        }

        if (!checkFileFormat(formData.file)) {
            setFormData({
                ...formData,
                error: "Error: The selected file is not in CSV format. Please select a CSV file.",
            });
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setFormData((prev) => ({
                ...prev,
                file: null,
                projectIDList: null,
            }));
            return;
        }

        setFormData({
            ...formData,
            error: "Processing CSV file...",
            projectIDList: null,
        });

        let extractedProjectIDs: string[] = [];
        try {
            // 🌟 PapaParseによる抽出を実行
            extractedProjectIDs = await extractProjectIDs(formData.file);
            console.log("Extracted Project ID List:", extractedProjectIDs);
        } catch (error) {
            setFormData({
                ...formData,
                error:
                    error instanceof Error
                        ? error.message
                        : "An unknown error occurred during file processing.",
            });
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setFormData((prev) => ({ ...prev, file: null }));
            return;
        }

        setFormData((prev) => ({
            ...prev,
            projectIDList: extractedProjectIDs,
            error: "Sending information to the backend...",
        }));

        const postData = {
            url: formData.url,
            projectIDList: extractedProjectIDs,
        };
        console.log("Data to be sent to the backend:", postData);

        // 実際のPOST通信を行う場合は、以下のシミュレーション部分をfetch APIなどに置き換えてください。
        setTimeout(() => {
            setFormData({
                file: null,
                url: "",
                projectIDList: null,
                error: "(Simulation) File sent successfully!",
            });
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }, 3000);
    };

    return (
        <div>
            <div>
                <h1>掲載終了企業 グレーアウトフォーム</h1>
                <p>
                    掲載終了した企業の一覧をcsv形式でアップロードし、処理対象のURLを入力してください。
                </p>

                {formData.error && (
                    <p
                        style={{
                            color: formData.error.includes("Error")
                                ? "red"
                                : "green",
                        }}
                    >
                        {formData.error}
                    </p>
                )}
                {formData.projectIDList &&
                    formData.projectIDList.length > 0 && (
                        <p style={{ color: "blue" }}>
                            Project ID Count: {formData.projectIDList.length}{" "}
                            items (Ready to send)
                        </p>
                    )}

                <form onSubmit={sendForm}>
                    <label htmlFor="target_url">処理対象URL：</label>
                    <input
                        type="url"
                        id="target_url"
                        name="target_url"
                        required
                        value={formData.url}
                        onChange={handleUrlChange}
                        placeholder="例: https://example.com/target"
                    />
                    <br />
                    <br />

                    <label htmlFor="csv_file">CSVファイルを選択:</label>
                    <input
                        type="file"
                        id="csv_file"
                        name="csv_file"
                        accept=".csv"
                        required
                        onChange={handleFileChange}
                        ref={fileInputRef}
                    />
                    <br />
                    <br />

                    <button
                        type="submit"
                        disabled={!formData.file || !formData.url}
                    >
                        送信
                    </button>
                </form>
            </div>
        </div>
    );
}
