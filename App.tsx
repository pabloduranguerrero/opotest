import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import rawData from './data/questions.json';

type Question = {
  id: string;
  tema: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explicacion: string;
};

type QuestionStat = { answered: number; correct: number; wrong: number };
type StatsMap = Record<string, QuestionStat>;

type Mode = 'tema' | 'aleatorio' | 'simulacro' | 'repaso';
type Screen = 'home' | 'tema' | 'test' | 'result' | 'stats';

const STORE_KEY = 'opo-test:v1';
const questions = rawData.questions as Question[];

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<Mode>('aleatorio');
  const [selectedTema, setSelectedTema] = useState<string>('');
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [stats, setStats] = useState<StatsMap>({});
  const [started, setStarted] = useState(false);

  const temas = useMemo(() => Array.from(new Set(questions.map((q) => q.tema))).sort(), []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setStats(JSON.parse(raw) as StatsMap);
      } catch {
        setStats({});
      }
    })();
  }, []);

  const persistStats = async (next: StatsMap) => {
    setStats(next);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  };

  const startTest = (m: Mode, tema?: string) => {
    let q: Question[] = [];

    if (m === 'tema') q = questions.filter((x) => x.tema === tema);
    if (m === 'aleatorio') q = shuffle(questions).slice(0, 20);
    if (m === 'simulacro') q = shuffle(questions).slice(0, 50);
    if (m === 'repaso') {
      const failed = questions.filter((x) => (stats[x.id]?.wrong ?? 0) > 0);
      q = shuffle(failed).slice(0, 30);
      if (!q.length) {
        Alert.alert('Repaso', 'Aún no tienes preguntas falladas. Haz tests primero.');
        return;
      }
    }

    if (!q.length) {
      Alert.alert('Sin preguntas', 'No hay preguntas para este modo.');
      return;
    }

    setMode(m);
    if (tema) setSelectedTema(tema);
    setTestQuestions(q);
    setIndex(0);
    setScore(0);
    setShowFeedback(false);
    setScreen('test');
  };

  const answer = async (optionIndex: number) => {
    const current = testQuestions[index];
    const isCorrect = optionIndex === current.correcta;
    setLastCorrect(isCorrect);
    setShowFeedback(true);
    if (isCorrect) setScore((s) => s + 1);

    const old = stats[current.id] ?? { answered: 0, correct: 0, wrong: 0 };
    const updated: StatsMap = {
      ...stats,
      [current.id]: {
        answered: old.answered + 1,
        correct: old.correct + (isCorrect ? 1 : 0),
        wrong: old.wrong + (isCorrect ? 0 : 1),
      },
    };
    await persistStats(updated);
  };

  const next = () => {
    setShowFeedback(false);
    if (index + 1 >= testQuestions.length) {
      setScreen('result');
    } else {
      setIndex((i) => i + 1);
    }
  };

  const totalAnswered = Object.values(stats).reduce((a, s) => a + s.answered, 0);
  const totalCorrect = Object.values(stats).reduce((a, s) => a + s.correct, 0);
  const globalRate = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const worstQuestions = [...questions]
    .map((q) => ({ q, wrong: stats[q.id]?.wrong ?? 0 }))
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 10);

  const progressByTema = temas.map((t) => {
    const qTema = questions.filter((q) => q.tema === t);
    const ans = qTema.reduce((a, q) => a + (stats[q.id]?.answered ?? 0), 0);
    const cor = qTema.reduce((a, q) => a + (stats[q.id]?.correct ?? 0), 0);
    return { tema: t, rate: ans ? Math.round((cor / ans) * 100) : 0, ans };
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.container}>
          {!started ? (
            <View style={styles.hero}>
              <Text style={styles.logoEmoji}>👮‍♂️</Text>
              <Text style={styles.title}>OpoTest Policía</Text>
              <Text style={styles.sub}>Policía Nacional · Entrenamiento tipo test</Text>
              <TouchableOpacity style={styles.btn} onPress={() => setStarted(true)}>
                <Text style={styles.btnText}>Empezar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>OpoTest Policía</Text>
              <Text style={styles.sub}>Entrena como academia: rápido, serio y enfocado en fallos.</Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Resumen</Text>
                <Text style={styles.text}>Preguntas respondidas: {totalAnswered}</Text>
                <Text style={styles.text}>Acierto global: {globalRate}%</Text>
              </View>

              <TouchableOpacity style={styles.btn} onPress={() => setScreen('tema')}>
                <Text style={styles.btnText}>Test por tema</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} onPress={() => startTest('aleatorio')}>
                <Text style={styles.btnText}>Test aleatorio (20)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} onPress={() => startTest('simulacro')}>
                <Text style={styles.btnText}>Simulacro examen (50)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} onPress={() => startTest('repaso')}>
                <Text style={styles.btnText}>Repaso inteligente (falladas)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('stats')}>
                <Text style={styles.secondaryBtnText}>Ver estadísticas</Text>
              </TouchableOpacity>

              <View style={styles.banner}><Text style={styles.bannerText}>Banner anuncio (simulado)</Text></View>
            </>
          )}
        </ScrollView>
      )}

      {screen === 'tema' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Selecciona tema</Text>
          {temas.map((t) => (
            <TouchableOpacity key={t} style={styles.btn} onPress={() => startTest('tema', t)}>
              <Text style={styles.btnText}>{t}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('home')}>
            <Text style={styles.secondaryBtnText}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {screen === 'test' && testQuestions[index] && (
        <View style={styles.container}>
          <Text style={styles.sub}>{mode === 'tema' ? `Tema: ${selectedTema}` : mode.toUpperCase()} · {index + 1}/{testQuestions.length}</Text>
          <Text style={styles.question}>{testQuestions[index].enunciado}</Text>

          {testQuestions[index].opciones.map((o, i) => (
            <TouchableOpacity key={i} style={styles.option} disabled={showFeedback} onPress={() => answer(i)}>
              <Text style={styles.optionText}>{String.fromCharCode(65 + i)}. {o}</Text>
            </TouchableOpacity>
          ))}

          {showFeedback && (
            <View style={styles.feedbackBox}>
              <Text style={{ color: lastCorrect ? '#42F87B' : '#FF6B6B', fontWeight: '800' }}>
                {lastCorrect ? '✅ Correcta' : '❌ Incorrecta'}
              </Text>
              <Text style={styles.text}>{testQuestions[index].explicacion}</Text>
              <TouchableOpacity style={styles.btn} onPress={next}>
                <Text style={styles.btnText}>{index + 1 >= testQuestions.length ? 'Ver resultado' : 'Siguiente'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {screen === 'result' && (
        <View style={styles.container}>
          <Text style={styles.title}>Resultado</Text>
          <Text style={styles.text}>Aciertos: {score}/{testQuestions.length}</Text>
          <Text style={styles.text}>Porcentaje: {Math.round((score / testQuestions.length) * 100)}%</Text>

          <View style={styles.interstitial}><Text style={styles.bannerText}>Interstitial (simulado)</Text></View>

          <TouchableOpacity style={styles.btn} onPress={() => setScreen('home')}>
            <Text style={styles.btnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'stats' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Estadísticas</Text>
          <Text style={styles.text}>Respondidas: {totalAnswered}</Text>
          <Text style={styles.text}>Acierto global: {globalRate}%</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Progreso por tema</Text>
            {progressByTema.map((p) => (
              <Text key={p.tema} style={styles.text}>• {p.tema}: {p.rate}% ({p.ans} resp.)</Text>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preguntas más falladas</Text>
            {worstQuestions.length === 0 ? <Text style={styles.text}>Sin fallos aún</Text> : worstQuestions.map((w) => (
              <Text key={w.q.id} style={styles.text}>• {w.q.id} ({w.q.tema}) → {w.wrong} fallos</Text>
            ))}
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('home')}>
            <Text style={styles.secondaryBtnText}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E1117' },
  container: { padding: 16, gap: 10 },
  hero: { minHeight: 420, justifyContent: 'center', alignItems: 'center', gap: 12 },
  logoEmoji: { fontSize: 72 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#9FB0CB' },
  card: { backgroundColor: '#171C26', borderRadius: 14, borderWidth: 1, borderColor: '#283247', padding: 12 },
  cardTitle: { color: '#E6EBF7', fontWeight: '800', marginBottom: 6 },
  text: { color: '#CED7E9', marginBottom: 4 },
  btn: { backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { backgroundColor: '#2B3548', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#fff', fontWeight: '700' },
  banner: { marginTop: 6, height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#33415B', justifyContent: 'center', alignItems: 'center' },
  bannerText: { color: '#9FB0CB', fontWeight: '700' },
  question: { color: '#fff', fontSize: 21, fontWeight: '700', marginVertical: 6 },
  option: { backgroundColor: '#1B2332', borderRadius: 12, borderWidth: 1, borderColor: '#31405C', padding: 12 },
  optionText: { color: '#E6EBF7' },
  feedbackBox: { backgroundColor: '#121722', borderWidth: 1, borderColor: '#2A3347', borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  interstitial: { marginVertical: 10, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#33415B', alignItems: 'center', justifyContent: 'center' },
});
