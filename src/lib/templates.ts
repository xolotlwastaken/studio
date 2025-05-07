export const defaultSummaryTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Transcript Summary</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 20px;
        }
        h1, h2, h3 {
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f0f0f0;
        }
    </style>
</head>
<body>
    <h1>📄 Transcript Summary</h1>
    <p><strong>Title:</strong> {{title}}</p>
    <p><strong>Date:</strong> {{date}}</p>
    <p><strong>Speaker(s):</strong> {{speakers}}</p>
    <p><strong>Context:</strong> {{context}}</p>
    <p><strong>Location / Platform:</strong> {{location_or_platform}}</p>

    <hr>

    <h2>🧭 Overview</h2>
    <p>{{summary_overview}}</p>

    <hr>

    <h2>🗂️ Key Topics</h2>
    <h3>1. {{topic_1_title}}</h3>
    <ul><li>{{point_1}}</li><li>{{point_2}}</li></ul>
    <h3>2. {{topic_2_title}}</h3>
    <ul><li>{{point_1}}</li><li>{{point_2}}</li></ul>
    <p><i>...continue for more topics...</i></p>

    <hr>

    <h2>✅ Key Takeaways</h2>
    <ul><li>{{takeaway_1}}</li><li>{{takeaway_2}}</li><li>{{takeaway_3}}</li></ul>

    <hr>
    <h2>📋 Action Points (if applicable)</h2>
    <table><thead><tr><th>Action</th><th>Assigned To</th><th>Deadline</th></tr></thead><tbody><tr><td>{{action_1}}</td><td>{{person_1}}</td><td>{{due_date_1}}</td></tr><tr><td>{{action_2}}</td><td>{{person_2}}</td><td>{{due_date_2}}</td></tr></tbody></table>
    <hr>
    <h2>🗒️ Additional Notes</h2>
    <p>{{extra_notes}}</p>
</body>
</html>
`;