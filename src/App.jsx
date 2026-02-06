
import { useState,useEffect } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
//imports gemini ai library
import * as pdfjsLib from "pdfjs-dist"; //library for reading pdfs
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
//worker file for pdf.js, needed to prevent "pdfjsLib.getDocument is not a function" error
// Tell pdf.js where its worker lives
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
//tells where the file is located
import "./App.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function App() {
 



  // ---------- STATE ----------
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);

  const [results, setResults] = useState(() => {
  const saved = localStorage.getItem("studyResults");
  return saved ? JSON.parse(saved) : [];
});
useEffect(() => {
  localStorage.setItem("studyResults", JSON.stringify(results));
},[results]);
const [selectedIndex, setSelectedIndex] = useState(null);





  // ---------- SAFE DERIVED VALUES ----------
  // These prevent "undefined" crashes
  const latestResult =
    results.length > 0 ? results[results.length - 1] : null;
const displayedResult =
  selectedIndex !== null
    ? results[selectedIndex]
    : latestResult;
  const previousResult =
    results.length > 1 ? results[results.length - 2] : null;

  const progress =
    latestResult && previousResult
      ? latestResult.score - previousResult.score
      : null;
      const improvementSummary = () => {
  if (!latestResult || !previousResult) return null;

  const prevMistakes = previousResult.feedback.quotedMistakes.map(m => m.studentQuote);
  const currentMistakes = latestResult.feedback.quotedMistakes.map(m => m.studentQuote);

  const fixed = prevMistakes.filter(m => !currentMistakes.includes(m));
  const stillWeak = currentMistakes.filter(m => prevMistakes.includes(m));

  return { fixed, stillWeak };
};


      const repeatedMistakes = () => {
  const map = {};

  results.forEach(r => {
    r.feedback.quotedMistakes?.forEach(m => {
      const key = m.studentQuote.toLowerCase();
      map[key] = (map[key] || 0) + 1;
    });
  });

  return Object.entries(map).filter(([, count]) => count > 1);
};


  // ---------- PDF TEXT EXTRACTION ----------
  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => item.str)
        .join(" ");

      fullText += pageText + "\n";
    }

    return fullText;
  };

  // ---------- SCORE CALCULATION ----------
  const calculateScore = (feedback) => {
    const mistakes = feedback.quotedMistakes?.length || 0;
    const strengths = feedback.strengths?.length || 0;
    const total = mistakes + strengths || 1;

    return Math.round((strengths / total) * 100);
  };
  // ---------- CHART DATA ----------
const chartData = results.map((r, index) => ({
  attempt: index + 1,
  score: r.score
}));


  // ---------- MAIN ACTION ----------
  const handleClick = async () => {
    if (!file || !subject) {
      alert("Please upload a PDF and select a subject.");
      return;
    }

    setLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  alert("API key missing! Check your .env file.");
  setLoading(false);
  return;
}

const genAI = new GoogleGenerativeAI(apiKey);


    

      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
      });

      const pdfText = await extractTextFromPDF(file);

      const prompt = `
You are an AI study diagnostician acting like a teacher marking a test.

The subject is ${subject}.

You MUST base feedback ONLY on what the student wrote.

Respond ONLY in valid JSON:

{
  "diagnosis": "...",
  "quotedMistakes": [
    { "studentQuote": "...", "issue": "...", "betterAnswer": "..." }
  ],
  "strengths": [
    { "studentQuote": "...", "whyItsGood": "..." }
  ],
  "studyPlan": ["Day 1...", "Day 2...", "Day 3..."]
}

Student work:
${pdfText}
`;

      const response = await model.generateContent(prompt);
      const rawText = response.response.text();

      // Remove markdown if Gemini adds it
      const cleaned = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      const score = calculateScore(parsed);

      const newAttempt = {
        pdfName: file.name,
        feedback: parsed,
        score,
        timestamp: new Date().toLocaleString(),
      };

      setResults((prev) => [...prev, newAttempt]);
    } catch (err) {
      console.error(err);
      alert("Gemini error — check console");
    }

    setLoading(false);
  };

  // ---------- UI ----------
  return (
    <div className="container">
      <h1> Welcome to Study AI diagnostician!</h1>
<div className="controls">
      <select onChange={(e) => setSubject(e.target.value)}>
        <option value="">Select Subject</option>
        <option>Math</option>
        <option>Science</option>
        <option>Accounting</option>
        <option>Programming</option>
      </select>

      <br /><br />

      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br /><br />

      <button onClick={handleClick}>Generate Feedback</button>
</div>
      {loading && <p className="loading-text">Analyzing your work...</p>}

      {/* ---------- RESULTS ---------- */}
      {displayedResult && (
        <div className="result-card">
          <h2>📊 Score: {displayedResult.score}%</h2>

          {progress !== null && (
            <p>
              {progress > 0 && `📈 Improved by ${progress}%`}
              {progress < 0 && `📉 Dropped by ${Math.abs(progress)}%`}
              {progress === 0 && `😐 No change since last attempt`}
            </p>
          )}

          <h3>Diagnosis</h3>
          <p>{displayedResult.feedback.diagnosis}</p>

          <h3>❌ Mistakes</h3>
          {displayedResult.feedback.quotedMistakes?.map((m, i) => (
            <div key={i} className="mistake">
              <p><strong>You wrote:</strong> “{m.studentQuote}”</p>
              <p><strong>Issue:</strong> {m.issue}</p>
              <p><strong>Better:</strong> {m.betterAnswer}</p>
            </div>
          ))}

          <h3>✅ Strengths</h3>
          <ul>
            {displayedResult.feedback.strengths?.map((s, i) => (
              <li key={i}>
                “{s.studentQuote}” — {s.whyItsGood}
              </li>
            ))}
          </ul>

          <h3>📚 Study Plan</h3>
          <ul>
            {displayedResult.feedback.studyPlan?.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
            <h3>⚠️ Repeated Mistakes</h3>
{repeatedMistakes().map(([text, count], i) => (
  <p key={i}>
    "{text}" — repeated {count} times
  </p>
))}

{improvementSummary() && (
  <>
    <h3>📈 Improvement Summary</h3>

    <p>✔ Fixed:</p>
    {improvementSummary().fixed.map((f,i)=>(
      <p key={i}>{f}</p>
    ))}

    <p>❌ Still weak:</p>
    {improvementSummary().stillWeak.map((w,i)=>(
      <p key={i}>{w}</p>
    ))}
  </>
)}
{/* ---------- PROGRESS CHART ---------- */}

{results.length > 1 && (
  <>
    <h3>📈 Progress Chart</h3>

    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />

          <XAxis
            dataKey="attempt"
            stroke="#FFD700"
          />

          <YAxis
            stroke="#FFD700"
          />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="score"
            stroke="#FF4500"
            strokeWidth={3}
            dot={{ r: 6, fill: "#FFD700" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </>
)}



          </ul>
<div className="upload-history">
          <h3>Upload History</h3>
          <ul>
            {results.map((r, i) => (
              <li key={i} onClick={()=>setSelectedIndex(i)}>
                {r.pdfName} — {r.timestamp}
              </li>
            ))}
          </ul>
        </div>
        </div>
      )}
    </div>
  );
}
