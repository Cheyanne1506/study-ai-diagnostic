
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
  const [testPDF, setTestPDF] = useState(null); // test questions PDF
const [attemptFile, setAttemptFile] = useState(null); // student answers PDF
const [subject, setSubject] = useState("");
const [selectedTestId, setSelectedTestId] = useState(null);
const [loading, setLoading] = useState(false);



  const [tests, setTests] = useState(() => {
  const saved = localStorage.getItem("studyTests");
  return saved ? JSON.parse(saved) : [];
});

useEffect(() => {
  localStorage.setItem("studyTests", JSON.stringify(tests));
}, [tests]);


const [selectedIndex, setSelectedIndex] = useState(null);


const selectedTest =
  tests.find(t => t.id === selectedTestId) || null;

const results = selectedTest?.attempts || [];




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
  const calculateEliteScore = (feedback, results) => {

  const strengths = feedback.strengths?.length || 0;
  const mistakes = feedback.quotedMistakes?.length || 0;

  const totalQuestions =
    feedback.estimatedTotalQuestions || (strengths + mistakes || 1);

  const answeredQuestions =
    feedback.answeredQuestions || (strengths + mistakes);

  // ---------- ACCURACY ----------
  const accuracy = strengths / (strengths + mistakes || 1);

  // ---------- COMPLETION ----------
  const completion = answeredQuestions / totalQuestions;

  const previousResult = results[results.length - 1];

  let growth = 0;
  let learningBonus = 0;
  let momentum = 0;

  if (previousResult) {

    const prevStrengths =
      previousResult.feedback.strengths?.length || 0;

    const prevMistakes =
      previousResult.feedback.quotedMistakes?.length || 0;

    const prevAccuracy =
      prevStrengths / (prevStrengths + prevMistakes || 1);

    // ---------- GROWTH ----------
    growth = accuracy - prevAccuracy;

    // ---------- LEARNING BEHAVIOUR ----------
    const prevMistakeQuotes =
      previousResult.feedback.quotedMistakes.map(m => m.studentQuote);

    const currentMistakeQuotes =
      feedback.quotedMistakes.map(m => m.studentQuote);

    const fixed =
      prevMistakeQuotes.filter(m => !currentMistakeQuotes.includes(m));

    const repeated =
      currentMistakeQuotes.filter(m => prevMistakeQuotes.includes(m));

    learningBonus =
      (fixed.length * 0.1) - (repeated.length * 0.05);

    // ---------- MOMENTUM ----------
    if (growth > 0) {
      momentum = 0.05;
    }
  }

  let finalScore =
    (accuracy * 0.5) +
    (completion * 0.2) +
    (growth * 0.15) +
    learningBonus +
    momentum;

  finalScore = finalScore * 100;

  return Math.max(0, Math.min(100, Math.round(finalScore)));
};

  // ---------- CHART DATA ----------
  const [chartSubject, setChartSubject] = useState("All");

const filteredResults =
  chartSubject === "All"
    ? results
    : results.filter(r => r.subject === chartSubject);

const chartData = filteredResults.map((r) => ({
  date: new Date(r.timestamp).toLocaleDateString(),
  score: r.score
}));
const calculateMovingAverage = (data, windowSize = 3) => {
  return data.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = data.slice(start, index + 1);
    const avg =
      subset.reduce((sum, item) => sum + item.score, 0) /
      subset.length;

    return {
      ...data[index],
      trend: Math.round(avg)
    };
  });
};

const smoothedChartData = calculateMovingAverage(chartData);

// ---------- DELETE A SPECIFIC ATTEMPT ----------
const deleteAttempt = (indexToDelete) => {

  setTests(prev =>
    prev.map(test => {
      if (test.id !== selectedTestId) return test;

      return {
        ...test,
        attempts: test.attempts.filter((_,i)=> i !== indexToDelete)
      };
    })
  );

  if (selectedIndex === indexToDelete) {
    setSelectedIndex(null);
  }
};

// ---------- CREATE NEW TEST ----------
const createTest = async () => {

  if (!testPDF || !subject) {
    alert("Upload exam PDF and select subject");
    return;
  }

  const newTest = {
    id: crypto.randomUUID(),
    testName: testPDF.name,
    subject,
    testPDF: testPDF.name,
    attempts: []
  };

  setTests(prev => [...prev, newTest]);
};

// ---------- MAIN ACTION ----------
const handleClick = async () => {
  if (!attemptFile || !selectedTestId) {
    alert("Please select a test and upload an attempt PDF.");
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
        model: "gemini-3-flash-preview",
      });

      const pdfText = await extractTextFromPDF(attemptFile);

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
  "studyPlan": ["Day 1...", "Day 2...", "Day 3..."],
  "estimatedTotalQuestions": number,
  "answeredQuestions": number
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
      const score = calculateEliteScore(parsed, results);

      const newAttempt = {
        pdfName: attemptFile.name,
        feedback: parsed,
        subject,
        score,
        timestamp: new Date().toLocaleString(),
      };
setTests(prev =>
  prev.map(test =>
    test.id === selectedTestId
      ? {
          ...test,
          attempts: [...test.attempts, newAttempt]
        }
      : test
  )
);


    } catch (err) {
      console.error(err);
      alert("Gemini error — check console");
    }

    setLoading(false);
  };
  
  // ---------- UI ----------
  return (
  <div className="container">
    <header>
      <h1>Study AI Diagnostician</h1>
      <p>Your personal AI tutor for test feedback and study plans.</p>
    </header>
   

    {/* ---------- CREATE TEST ---------- */}
    <div className="create-test">
      <h2>Create New Test</h2>
      <label>Upload Test PDF (questions only):</label>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setTestPDF(e.target.files[0])}
      />
      <br />
      <label>Select Subject:</label>
      <select onChange={(e) => setSubject(e.target.value)}>
        <option value="">Select Subject</option>
        <option>Math</option>
        <option>Science</option>
        <option>Accounting</option>
        <option>Programming</option>
        <option>History</option>
      </select>
      <br />
      <button onClick={createTest}>Create Test</button>
    </div>

    <hr />

    {/* ---------- SUBMIT ATTEMPT ---------- */}
    <div className="submit-attempt">
      <h2>Submit Attempt for Selected Test</h2>
      <label>Select Test:</label>
      <select onChange={(e) => setSelectedTestId(e.target.value)}>
        <option value="">Select Test</option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            {t.subject} — {t.testName}
          </option>
        ))}
      </select>
      <br />
      <label>Upload Attempt PDF (answers):</label>
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setAttemptFile(e.target.files[0])}
      />
      <br />
      <button onClick={handleClick}>Generate Feedback</button>
    </div>

    {loading && <p className="loading-text">Analyzing your work...</p>}

    {/* ---------- RESULTS ---------- */}
    {displayedResult && (
      <div className="result-card">
         <h2> Score: {displayedResult.score}%</h2>
         {progress !== null && (
          <p>
            {progress > 0 && "📈 Improvement of " + progress.toFixed(1) + "% since last attempt!"}
            {progress < 0 && "📉 Decline of " + Math.abs(progress).toFixed(1) + "% since last attempt."}
            {progress === 0 && "No change since last attempt."}
          </p>
        )}
        <h3>Diagnosis</h3>
        <p>{displayedResult.feedback.diagnosis}</p>
        
        <h3>Mistakes</h3>
        {displayedResult.feedback.quotedMistakes.map((mistake, i) => (
          <div key={i} className="mistake">
            <p><strong>Student Quote:</strong> {mistake.studentQuote}</p>
            <p><strong>Issue:</strong> {mistake.issue}</p>
            <p><strong>Better Answer:</strong> {mistake.betterAnswer}</p>
          </div>
        ))}
        <h3>Strengths</h3>
        {displayedResult.feedback.strengths.map((strength, i) => (
          <div key={i} className="strength">
            <p><strong>Student Quote:</strong> {strength.studentQuote}</p>
            <p><strong>Why It's Good:</strong> {strength.whyItsGood}</p>
          </div>
        ))}
        <h3>Study Plan</h3>
        <ol>
          {displayedResult.feedback.studyPlan.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <h3>Repeated Mistakes</h3>
        {repeatedMistakes().length > 0 && repeatedMistakes().map(([quote, count], i) => (
          <p key={i}>
            "{quote}" was repeated {count} times.
          </p>
        ))}
        {improvementSummary() && (
          <div className="improvement-summary">
            <h3>Improvement Summary</h3>
            <p><strong>Fixed Mistakes:</strong></p>
            <ul>
              {improvementSummary().fixed.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <p><strong>Still Weak Areas:</strong></p>
            <ul>
              {improvementSummary().stillWeak.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={() => deleteAttempt(selectedIndex !== null ? selectedIndex : results.length - 1)}>
          Delete This Attempt
        </button>

      </div>
    )}

    {/* ---------- CHART SECTION ---------- */}
    {results.length > 1 && (
  <div className="chart-section">
    <h3>📈 Progress Chart</h3>

    <label>Filter by Subject:</label>
    <select
      value={chartSubject}
      onChange={(e) => setChartSubject(e.target.value)}
    >
      <option value="All">All Subjects</option>
      {[...new Set(tests.map(t => t.subject))].map((sub, i) => (
        <option key={i} value={sub}>{sub}</option>
      ))}
    </select>

    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={smoothedChartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="date" stroke="#FFD700" />
          <YAxis stroke="#FFD700" />
          <Tooltip />

          {/* Actual score */}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#FF4500"
            strokeWidth={2}
          />

          {/* Trend line */}
          <Line
            type="monotone"
            dataKey="trend"
            stroke="#00FFAA"
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>

    {/* ---------- UPLOAD HISTORY ---------- */}
    {selectedTest && results.length > 0 && (
      <div className="upload-history">
        <h3>Upload History</h3>
        <ul>
          {results.map((r, i) => (
            <li key={i}>
              <span
                onClick={() => setSelectedIndex(i)}
                style={{ cursor: "pointer" }}
              >
                [{r.subject || "Unknown Subject"}] {r.pdfName} — {r.timestamp}
              </span>
              <button onClick={() => deleteAttempt(i)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
    )}
  </div>
  );
}