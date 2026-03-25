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
import rawDataPL from './data/questions_pl.json';
import temarioRaw from './data/temario_pn.json';
import temarioLocalRaw from './data/temario_pl.json';

type Question = {
  id: string;
  tema: string;
  temaId?: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explicacion: string;
};

type Tema = { id: string; numero: number; titulo: string };
type Bloque = { id: string; nombre: string; temas: Tema[] };

type QuestionStat = { answered: number; correct: number; wrong: number };
type StatsMap = Record<string, QuestionStat>;

type Mode = 'tema' | 'aleatorio' | 'simulacro' | 'repaso' | 'mas_falladas' | 'pendientes';
type Screen = 'profile' | 'home' | 'tema' | 'test' | 'result' | 'stats';
type OppProfile = 'pn' | 'pl';

const STORE_KEY = 'opo-test:v1';
const questions = rawData.questions as Question[];
const questionsPL = rawDataPL.questions as Question[];
const bloquesPN = (temarioRaw.bloques ?? []) as Bloque[];
const bloquesPL = (temarioLocalRaw.bloques ?? []) as Bloque[];

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('profile');
  const [profile, setProfile] = useState<OppProfile>('pn');
  const [mode, setMode] = useState<Mode>('aleatorio');
  const [selectedTemaId, setSelectedTemaId] = useState<string>('');
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [stats, setStats] = useState<StatsMap>({});
  const [started, setStarted] = useState(false);

  const bloques = profile === 'pn' ? bloquesPN : bloquesPL;
  const temas = useMemo(() => bloques.flatMap((b) => b.temas), [bloques]);

  const activeQuestions = profile === 'pn' ? questions : questionsPL;

  const temaTitle = (temaId?: string, fallback?: string) => {
    const t = temas.find((x) => x.id === temaId);
    return t ? `Tema ${t.numero}. ${t.titulo}` : (fallback ?? 'Tema');
  };

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

  const startTest = (m: Mode, temaId?: string) => {
    let q: Question[] = [];

    if (m === 'tema') q = activeQuestions.filter((x) => x.temaId === temaId);
    if (m === 'aleatorio') q = shuffle(activeQuestions).slice(0, 20);
    if (m === 'simulacro') q = shuffle(activeQuestions).slice(0, 50);
    if (m === 'repaso') {
      const failed = activeQuestions.filter((x) => (stats[x.id]?.wrong ?? 0) > 0);
      q = shuffle(failed).slice(0, 30);
      if (!q.length) {
        Alert.alert('Repaso', 'Aún no tienes preguntas falladas. Haz tests primero.');
        return;
      }
    }

    if (m === 'mas_falladas') {
      const ranked = [...activeQuestions]
        .map((q) => ({ q, wrong: stats[q.id]?.wrong ?? 0 }))
        .filter((x) => x.wrong > 0)
        .sort((a, b) => b.wrong - a.wrong)
        .slice(0, 40)
        .map((x) => x.q);

      q = ranked;
      if (!q.length) {
        Alert.alert('Más falladas', 'Aún no hay preguntas falladas suficientes.');
        return;
      }
    }

    if (m === 'pendientes') {
      const pending = activeQuestions.filter((q) => (stats[q.id]?.answered ?? 0) === 0);
      q = shuffle(pending).slice(0, 40);
      if (!q.length) {
        Alert.alert('Pendientes', 'Ya has respondido todas las preguntas cargadas.');
        return;
      }
    }

    if (!q.length) {
      Alert.alert('Sin preguntas', 'No hay preguntas para este modo.');
      return;
    }

    setMode(m);
    if (temaId) setSelectedTemaId(temaId);
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
  const totalWrong = Object.values(stats).reduce((a, s) => a + s.wrong, 0);
  const totalNotAnswered = Math.max(activeQuestions.length - Object.keys(stats).filter((id) => (stats[id]?.answered ?? 0) > 0).length, 0);
  const globalRate = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const worstQuestions = [...activeQuestions]
    .map((q) => ({ q, wrong: stats[q.id]?.wrong ?? 0 }))
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 10);

  const progressByTema = temas.map((t) => {
    const qTema = activeQuestions.filter((q) => q.temaId === t.id);
    const ans = qTema.reduce((a, q) => a + (stats[q.id]?.answered ?? 0), 0);
    const cor = qTema.reduce((a, q) => a + (stats[q.id]?.correct ?? 0), 0);
    return { tema: `Tema ${t.numero}`, titulo: t.titulo, rate: ans ? Math.round((cor / ans) * 100) : 0, ans };
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {screen === 'profile' && (
        <View style={styles.container}>
          <Text style={styles.title}>Selecciona oposición</Text>
          <TouchableOpacity style={styles.btn} onPress={() => { setProfile('pn'); setStarted(false); setScreen('home'); }}>
            <Text style={styles.btnText}>Policía Nacional</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => { setProfile('pl'); setStarted(false); setScreen('home'); }}>
            <Text style={styles.btnText}>Policía Local</Text>
          </TouchableOpacity>
          <Text style={styles.sub}>Puedes cambiarla luego desde Inicio.</Text>
        </View>
      )}

      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.container}>
          {!started ? (
            <View style={styles.hero}>
              <Text style={styles.logoEmoji}>👮‍♂️</Text>
              <Text style={styles.title}>OpoTest Policía</Text>
              <Text style={styles.sub}>{profile === 'pn' ? 'Policía Nacional' : 'Policía Local'} · Entrenamiento tipo test</Text>
              <TouchableOpacity style={styles.btn} onPress={() => setStarted(true)}>
                <Text style={styles.btnText}>Empezar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>OpoTest Policía</Text>
              <Text style={styles.sub}>Perfil actual: {profile === 'pn' ? 'Policía Nacional' : 'Policía Local'}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('profile')}>
                <Text style={styles.secondaryBtnText}>Cambiar oposición</Text>
              </TouchableOpacity>

              <Text style={styles.sub}>Entrena como academia: rápido, serio y enfocado en fallos.</Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Resumen</Text>
                <Text style={styles.text}>Respondidas: {totalAnswered}</Text>
                <Text style={styles.text}>Aciertos: {totalCorrect}</Text>
                <Text style={styles.text}>Fallos: {totalWrong}</Text>
                <Text style={styles.text}>Pendientes: {totalNotAnswered}</Text>
                <Text style={styles.text}>Acierto global: {globalRate}%</Text>
              </View>

              {activeQuestions.length === 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Contenido en carga</Text>
                  <Text style={styles.text}>Este perfil está listo en estructura de temas, falta cargar preguntas masivas.</Text>
                </View>
              )}

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => setScreen('tema')}>
                <Text style={styles.btnText}>Test por tema</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => startTest('aleatorio')}>
                <Text style={styles.btnText}>Test aleatorio (20)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => startTest('simulacro')}>
                <Text style={styles.btnText}>Simulacro examen (50)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => startTest('repaso')}>
                <Text style={styles.btnText}>Repaso inteligente (falladas)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => startTest('mas_falladas')}>
                <Text style={styles.btnText}>Test de preguntas más falladas</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btn} disabled={activeQuestions.length === 0} onPress={() => startTest('pendientes')}>
                <Text style={styles.btnText}>Test de preguntas pendientes</Text>
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
          {bloques.map((b) => (
            <View key={b.id} style={styles.card}>
              <Text style={styles.cardTitle}>{b.nombre}</Text>
              {b.temas.map((t) => {
                const count = activeQuestions.filter((q) => q.temaId === t.id).length;
                return (
                  <TouchableOpacity key={t.id} style={styles.secondaryBtn} onPress={() => startTest('tema', t.id)}>
                    <Text style={styles.secondaryBtnText}>Tema {t.numero} · {count} preguntas</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('home')}>
            <Text style={styles.secondaryBtnText}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {screen === 'test' && testQuestions[index] && (
        <View style={styles.container}>
          <Text style={styles.sub}>{mode === 'tema' ? temaTitle(selectedTemaId) : mode.toUpperCase()} · {index + 1}/{testQuestions.length}</Text>
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
          <Text style={styles.text}>Aciertos: {totalCorrect}</Text>
          <Text style={styles.text}>Fallos: {totalWrong}</Text>
          <Text style={styles.text}>Pendientes: {totalNotAnswered}</Text>
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
              <Text key={w.q.id} style={styles.text}>• {w.q.id} ({temaTitle(w.q.temaId, w.q.tema)}) → {w.wrong} fallos</Text>
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
