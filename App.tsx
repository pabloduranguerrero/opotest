import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
type Screen = 'profile' | 'home' | 'tema' | 'test' | 'result' | 'stats' | 'account';
type OppProfile = 'pn' | 'pl';
type UserAccount = { name: string; email: string };

const STORE_KEY = 'opo-test:v2';
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

function uniqueByStatement(list: Question[]) {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of list) {
    const key = q.enunciado.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function pickUniqueQuestions(source: Question[], count: number) {
  return shuffle(uniqueByStatement(source)).slice(0, count);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('profile');
  const [profile, setProfile] = useState<OppProfile>('pn');
  const [mode, setMode] = useState<Mode>('aleatorio');
  const [selectedTemaId, setSelectedTemaId] = useState<string>('');
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<StatsMap>({});
  const [account, setAccount] = useState<UserAccount>({ name: '', email: '' });
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
        if (!raw) return;
        const parsed = JSON.parse(raw) as { stats?: StatsMap; account?: UserAccount } | StatsMap;

        // Compatibilidad con versión antigua (solo stats)
        if ('stats' in parsed || 'account' in parsed) {
          setStats((parsed as any).stats ?? {});
          setAccount((parsed as any).account ?? { name: '', email: '' });
        } else {
          setStats(parsed as StatsMap);
        }
      } catch {
        setStats({});
      }
    })();
  }, []);

  const persistAll = async (nextStats: StatsMap, nextAccount: UserAccount = account) => {
    setStats(nextStats);
    setAccount(nextAccount);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ stats: nextStats, account: nextAccount }));
  };

  const startTest = (m: Mode, temaId?: string) => {
    let q: Question[] = [];

    if (m === 'tema') q = pickUniqueQuestions(activeQuestions.filter((x) => x.temaId === temaId), 40);
    if (m === 'aleatorio') q = pickUniqueQuestions(activeQuestions, 20);
    if (m === 'simulacro') q = pickUniqueQuestions(activeQuestions, 50);
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
    setSessionAnswers({});
    setScreen('test');
  };

  const answer = (optionIndex: number) => {
    const current = testQuestions[index];
    setSessionAnswers((prev) => ({ ...prev, [current.id]: optionIndex }));
  };

  const goNext = () => {
    if (index + 1 < testQuestions.length) setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const finishTest = async () => {
    let localScore = 0;
    const updated = { ...stats };

    for (const q of testQuestions) {
      const ans = sessionAnswers[q.id];
      if (ans === undefined) continue;
      const isCorrect = ans === q.correcta;
      if (isCorrect) localScore += 1;

      const old = updated[q.id] ?? { answered: 0, correct: 0, wrong: 0 };
      updated[q.id] = {
        answered: old.answered + 1,
        correct: old.correct + (isCorrect ? 1 : 0),
        wrong: old.wrong + (isCorrect ? 0 : 1),
      };
    }

    setScore(localScore);
    await persistAll(updated);
    setScreen('result');
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
      <StatusBar style="dark" />

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
                <Text style={styles.cardTitle}>Perfil de estudio</Text>
                <Text style={styles.text}>Nombre: {account.name || 'Sin configurar'}</Text>
                <Text style={styles.text}>Email: {account.email || 'Sin configurar'}</Text>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('account')}>
                  <Text style={styles.secondaryBtnText}>Editar perfil</Text>
                </TouchableOpacity>
              </View>

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

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Monetización</Text>
                <Text style={styles.text}>Banner activo en inicio (simulado).</Text>
                <Text style={styles.text}>Interstitial al finalizar test (simulado).</Text>
                <Text style={styles.sub}>Preparado para integrar AdMob real en siguiente fase.</Text>
              </View>

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

      {screen === 'account' && (
        <View style={styles.container}>
          <Text style={styles.title}>Tu perfil</Text>
          <TextInput
            placeholder="Nombre"
            placeholderTextColor="#7aa5c4"
            value={account.name}
            onChangeText={(v) => setAccount((a) => ({ ...a, name: v }))}
            style={styles.input}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor="#7aa5c4"
            value={account.email}
            onChangeText={(v) => setAccount((a) => ({ ...a, email: v }))}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.btn}
            onPress={async () => {
              await persistAll(stats, account);
              setScreen('home');
            }}
          >
            <Text style={styles.btnText}>Guardar perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setScreen('home')}>
            <Text style={styles.secondaryBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'test' && testQuestions[index] && (
        <View style={styles.container}>
          <Text style={styles.sub}>{mode === 'tema' ? temaTitle(selectedTemaId) : mode.toUpperCase()} · {index + 1}/{testQuestions.length}</Text>
          <Text style={styles.question}>{testQuestions[index].enunciado}</Text>

          {testQuestions[index].opciones.map((o, i) => {
            const selected = sessionAnswers[testQuestions[index].id] === i;
            return (
              <TouchableOpacity key={i} style={[styles.option, selected && styles.optionSelected]} onPress={() => answer(i)}>
                <Text style={styles.optionText}>{String.fromCharCode(65 + i)}. {o}</Text>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.sub}>Las correcciones se mostrarán al finalizar el test.</Text>

          <View style={styles.navRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={goPrev}>
              <Text style={styles.secondaryBtnText}>Anterior</Text>
            </TouchableOpacity>
            {index + 1 < testQuestions.length ? (
              <TouchableOpacity style={styles.btn} onPress={goNext}>
                <Text style={styles.btnText}>Siguiente</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.btn} onPress={() => void finishTest()}>
                <Text style={styles.btnText}>Finalizar test</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.exitBtn} onPress={() => setScreen('home')}>
            <Text style={styles.exitBtnText}>Salir del test</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'result' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Resultado</Text>
          <Text style={styles.text}>Aciertos: {score}/{testQuestions.length}</Text>
          <Text style={styles.text}>Porcentaje: {Math.round((score / testQuestions.length) * 100)}%</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Errores del test</Text>
            {testQuestions.filter((q) => sessionAnswers[q.id] !== undefined && sessionAnswers[q.id] !== q.correcta).length === 0 ? (
              <Text style={styles.text}>Sin errores en este test. ¡Buen trabajo!</Text>
            ) : (
              testQuestions
                .filter((q) => sessionAnswers[q.id] !== undefined && sessionAnswers[q.id] !== q.correcta)
                .map((q) => (
                  <View key={q.id} style={{ marginBottom: 10 }}>
                    <Text style={styles.text}>• {q.enunciado}</Text>
                    <Text style={styles.text}>Tu respuesta: {String.fromCharCode(65 + (sessionAnswers[q.id] ?? 0))}</Text>
                    <Text style={styles.text}>Correcta: {String.fromCharCode(65 + q.correcta)}</Text>
                    <Text style={styles.sub}>{q.explicacion}</Text>
                  </View>
                ))
            )}
          </View>

          <View style={styles.interstitial}><Text style={styles.bannerText}>Interstitial (simulado)</Text></View>

          <TouchableOpacity style={styles.btn} onPress={() => setScreen('home')}>
            <Text style={styles.btnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </ScrollView>
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
  safe: { flex: 1, backgroundColor: '#EAF7FF' },
  container: { padding: 16, gap: 10 },
  hero: { minHeight: 420, justifyContent: 'center', alignItems: 'center', gap: 12 },
  logoEmoji: { fontSize: 72 },
  title: { color: '#0B3658', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#3E6E90' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#BFE4FA', padding: 12 },
  cardTitle: { color: '#0B3658', fontWeight: '800', marginBottom: 6 },
  text: { color: '#1F4F72', marginBottom: 4 },
  btn: { backgroundColor: '#2D8FE6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { backgroundColor: '#D9F0FF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#0B3658', fontWeight: '700' },
  banner: { marginTop: 6, height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#A8D9F5', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4FBFF' },
  bannerText: { color: '#3E6E90', fontWeight: '700' },
  question: { color: '#0B3658', fontSize: 21, fontWeight: '700', marginVertical: 6 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#BFE4FA', padding: 12, color: '#123F61' },
  option: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#BFE4FA', padding: 12 },
  optionSelected: { borderColor: '#2D8FE6', backgroundColor: '#DFF1FF' },
  optionText: { color: '#123F61' },
  navRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  exitBtn: { alignItems: 'center', paddingVertical: 10 },
  exitBtnText: { color: '#B42318', fontWeight: '700' },
  feedbackBox: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFE4FA', borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  interstitial: { marginVertical: 10, height: 90, borderRadius: 12, borderWidth: 1, borderColor: '#A8D9F5', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4FBFF' },
});
