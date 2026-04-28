/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, ListTodo, Search, LogOut, LogIn, Loader2, Calendar, AlertCircle, Clock, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  auth, 
  signIn, 
  logOut, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: any;
  ownerId: string;
  dueDate?: any;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
}

type FilterType = 'all' | 'active' | 'completed';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Handle Authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Handle Firestore Real-time Updates
  useEffect(() => {
    if (!user) {
      setTodos([]);
      return;
    }

    const q = query(
      collection(db, 'todos'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const todoData: Todo[] = [];
      snapshot.forEach((doc) => {
        todoData.push({ id: doc.id, ...doc.data() } as Todo);
      });
      setTodos(todoData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'todos');
    });

    return () => unsubscribe();
  }, [user]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isAdding) return;

    setIsAdding(true);
    try {
      const todoData: any = {
        text: input,
        completed: false,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        recurrence,
      };

      if (dueDateInput) {
        todoData.dueDate = Timestamp.fromDate(new Date(dueDateInput));
      }

      await addDoc(collection(db, 'todos'), todoData);
      setInput('');
      setDueDateInput('');
      setRecurrence('none');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'todos');
    } finally {
      setIsAdding(false);
    }
  };

  const calculateNextDate = (currentDate: Date, pattern: 'daily' | 'weekly' | 'monthly') => {
    const nextDate = new Date(currentDate);
    if (pattern === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (pattern === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (pattern === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return nextDate;
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const newCompleted = !todo.completed;
      await updateDoc(doc(db, 'todos', todo.id), {
        completed: newCompleted,
      });

      // If marking as completed and it's recurring, create the next instance
      if (newCompleted && todo.recurrence && todo.recurrence !== 'none') {
        const currentDate = todo.dueDate 
          ? (todo.dueDate.toDate ? todo.dueDate.toDate() : new Date(todo.dueDate))
          : new Date();
        
        const nextDate = calculateNextDate(currentDate, todo.recurrence);
        
        await addDoc(collection(db, 'todos'), {
          text: todo.text,
          completed: false,
          ownerId: todo.ownerId,
          createdAt: serverTimestamp(),
          dueDate: Timestamp.fromDate(nextDate),
          recurrence: todo.recurrence,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `todos/${todo.id}`);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'todos', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `todos/${id}`);
    }
  };

  const getDueDateStatus = (dueDate: any) => {
    if (!dueDate) return null;
    
    const date = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'ហួសកំណត់', color: 'text-red-500 bg-red-50', icon: <AlertCircle className="w-3 h-3" /> };
    if (diffDays === 0) return { label: 'ថ្ងៃនេះ', color: 'text-orange-500 bg-orange-50', icon: <Clock className="w-3 h-3" /> };
    if (diffDays <= 3) return { label: `ក្នុងរយៈពេល ${diffDays} ថ្ងៃ`, color: 'text-blue-500 bg-blue-50', icon: <Calendar className="w-3 h-3" /> };
    
    return { label: date.toLocaleDateString('km-KH'), color: 'text-gray-400 bg-gray-50', icon: <Calendar className="w-3 h-3" /> };
  };

  const getRecurrenceLabel = (pattern?: string) => {
    switch (pattern) {
      case 'daily': return 'រាល់ថ្ងៃ';
      case 'weekly': return 'រាល់សប្តាហ៍';
      case 'monthly': return 'រាល់ខែ';
      default: return null;
    }
  };

  const filteredTodos = todos
    .filter(todo => {
      if (filter === 'active') return !todo.completed;
      if (filter === 'completed') return todo.completed;
      return true;
    })
    .filter(todo => 
      todo.text.toLowerCase().includes(search.toLowerCase())
    );

  const stats = {
    total: todos.length,
    active: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length,
  };

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (error: any) {
      console.error("Login Error Details:", {
        code: error.code,
        message: error.message,
        domain: window.location.hostname
      });
      
      if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        alert(`Domain "${domain}" មិនទាន់ត្រូវបានអនុញ្ញាតក្នុង Firebase ទេ។\n\nសូមអនុវត្តតាមជំហាននេះ៖\n1. ចូលទៅ Firebase Console\n2. ជ្រើសរើស "Authentication" -> "Settings"\n3. ជ្រើសរើស "Authorized domains"\n4. បន្ថែម "${domain}" ចូលក្នុងបញ្ជី។`);
      } else if (error.code === 'auth/popup-blocked') {
        alert("កម្មវិធីរុករក (Browser) របស់អ្នកបានរារាំងផ្ទាំង Login (Popup)។ សូមអនុញ្ញាតឱ្យ Popup បើកដំណើរការសម្រាប់គេហទំព័រនេះ។");
      } else {
        alert("មានបញ្ហាក្នុងការចូលប្រើប្រាស់៖ " + error.message);
      }
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass p-12 rounded-[2.5rem] max-w-md w-full text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
          <div className="bg-indigo-50 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner ring-4 ring-white">
            <ListTodo className="w-12 h-12 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold mb-3 tracking-tight text-slate-800 khmer-font font-sans">សូមស្វាគមន៍</h1>
          <p className="text-slate-500 text-base mb-10 khmer-font font-light italic">គ្រប់គ្រងរាល់កិច្ចការរបស់អ្នកនៅក្នុងកន្លែងតែមួយជាមួយភាពងាយស្រួល។</p>
          
          <div className="space-y-4">
            <button
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-4 rounded-2xl hover:bg-slate-800 active:scale-[0.98] transition-all font-semibold shadow-lg shadow-indigo-200"
            >
              <LogIn className="w-6 h-6" />
              <span className="khmer-font">ចូលជាមួយ Google</span>
            </button>
            
            <p className="text-[10px] text-slate-400 khmer-font leading-relaxed">
              * ប្រសិនបើអ្នកមិនអាចចូលបាន សូមប្រាកដថាអ្នកបានបន្ថែម Domain នេះទៅក្នុង <br/>
              <span className="font-bold text-slate-500">Authorized Domains</span> ក្នុង Firebase Console។
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-100/50 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-100/40 blur-[130px]"></div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar - Stats & User */}
        <aside className="lg:w-80 flex-shrink-0 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass rounded-3xl p-6 relative overflow-hidden"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="relative">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.email}&background=6366f1&color=fff`} className="w-14 h-14 rounded-2xl border-2 border-white shadow-sm object-cover" alt="User profile" referrerPolicy="no-referrer" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-slate-800 truncate leading-tight khmer-font">{user.displayName || 'អ្នកប្រើប្រាស់'}</h2>
                <p className="text-slate-400 text-xs truncate uppercase tracking-widest font-semibold mt-0.5">{user.email?.split('@')[0]}</p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50">
                <div className="flex justify-between items-center text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3 khmer-font">
                  <span>វឌ្ឍនភាព</span>
                  <span>{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</span>
                </div>
                <div className="h-2 w-full bg-indigo-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                    className="h-full bg-indigo-500 rounded-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass bg-white p-4 rounded-2xl text-center border-slate-100">
                  <div className="text-2xl font-black text-slate-800">{stats.active}</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 khmer-font">កំពុងធ្វើ</div>
                </div>
                <div className="glass bg-white p-4 rounded-2xl text-center border-slate-100">
                  <div className="text-2xl font-black text-slate-800 text-green-500">{stats.completed}</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 khmer-font">ចប់ហើយ</div>
                </div>
              </div>
            </div>

            <button
              onClick={logOut}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-sm font-bold uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              <span className="khmer-font">ចាកចេញ</span>
            </button>
          </motion.div>

          <div className="hidden lg:block space-y-3">
            <h3 className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] khmer-font">តម្រង</h3>
            {(['all', 'active', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                  filter === f
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 translate-x-2'
                    : 'text-slate-500 hover:bg-white hover:shadow-sm'
                }`}
              >
                <span className="khmer-font">{f === 'all' ? 'ទាំងអស់' : f === 'active' ? 'កំពុងធ្វើ' : 'បានបញ្ចប់'}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-lg ${filter === f ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                  {f === 'all' ? stats.total : f === 'active' ? stats.active : stats.completed}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 space-y-6">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-3xl lg:text-4xl font-black text-slate-900 khmer-font">ការងារថ្ងៃនេះ</h1>
            <div className="relative group sm:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ស្វែងរក..."
                className="w-full pl-12 pr-4 py-3.5 glass-dark text-white rounded-2xl text-sm outline-none placeholder:text-slate-500 ring-4 ring-transparent focus:ring-indigo-500/10 transition-all khmer-font"
              />
            </div>
          </header>

          {/* Add Todo Inline Container */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-3xl p-2 shadow-xl shadow-slate-200/50 group focus-within:ring-4 focus-within:ring-indigo-100"
          >
            <form onSubmit={addTodo} className="flex flex-col">
              <div className="flex gap-2 p-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="តើអ្នកចង់ធ្វើអ្វីបន្តទៀត?"
                  className="flex-1 px-4 py-4 bg-transparent outline-none text-lg font-medium placeholder:text-slate-300 text-slate-700 khmer-font"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isAdding}
                  className="px-8 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-300"
                >
                  {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
                </button>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 px-6 pb-4 pt-2 border-t border-slate-50">
                 <div className="relative flex items-center gap-2 group cursor-pointer">
                    <Calendar className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    <span className={`text-xs font-bold uppercase tracking-widest khmer-font ${dueDateInput ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {dueDateInput || 'កាលបរិច្ឆេទ'}
                    </span>
                    <input
                      type="date"
                      value={dueDateInput}
                      onChange={(e) => setDueDateInput(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                 </div>

                 <div className="relative flex items-center gap-2 group cursor-pointer">
                    <RotateCcw className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                    <span className={`text-xs font-bold uppercase tracking-widest khmer-font ${recurrence !== 'none' ? 'text-orange-600' : 'text-slate-400'}`}>
                      {recurrence === 'none' ? 'ការធ្វើឡើងវិញ' : getRecurrenceLabel(recurrence)}
                    </span>
                    <select
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value as any)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    >
                      <option value="none">មិនមាន</option>
                      <option value="daily">រាល់ថ្ងៃ</option>
                      <option value="weekly">រាល់សប្តាហ៍</option>
                      <option value="monthly">រាល់ខែ</option>
                    </select>
                 </div>
              </div>
            </form>
          </motion.div>

          {/* mobile filters */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {(['all', 'active', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
                  filter === f
                    ? 'bg-slate-900 text-white shadow-lg'
                    : 'bg-white text-slate-400'
                }`}
              >
                <span className="khmer-font">{f === 'all' ? 'ទាំងអស់' : f === 'active' ? 'កំពុងធ្វើ' : 'បានបញ្ចប់'}</span>
              </button>
            ))}
          </div>

          {/* List Area */}
          <div className="space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredTodos.length > 0 ? (
                filteredTodos.map((todo) => {
                  const dueDateStatus = getDueDateStatus(todo.dueDate);
                  return (
                    <motion.div
                      key={todo.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`group p-5 rounded-[2rem] border transition-all flex items-start gap-5 ${
                        todo.completed 
                          ? 'bg-slate-50/50 border-slate-100 opacity-70 grayscale-[0.5]' 
                          : 'glass bg-white hover:shadow-xl hover:shadow-indigo-100/50'
                      }`}
                    >
                      <button
                        onClick={() => toggleTodo(todo)}
                        className={`shrink-0 mt-1 transition-transform active:scale-90 ${
                          todo.completed ? 'text-green-500' : 'text-slate-300 hover:text-indigo-400'
                        }`}
                      >
                        {todo.completed ? (
                          <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-100">
                             <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full border-2 border-slate-200 group-hover:border-indigo-300 transition-colors" />
                        )}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-lg font-bold leading-tight transition-all khmer-font ${
                            todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                          }`}
                        >
                          {todo.text}
                        </h3>
                        
                        <div className="flex flex-wrap gap-3 mt-3">
                          {dueDateStatus && (
                            <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 ${dueDateStatus.color} shadow-sm`}>
                              {dueDateStatus.icon}
                              <span className="khmer-font">{dueDateStatus.label}</span>
                            </div>
                          )}
                          {todo.recurrence && todo.recurrence !== 'none' && (
                            <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 bg-orange-50 text-orange-600 border border-orange-100 shadow-sm">
                              <RotateCcw className="w-3 h-3" />
                              <span className="khmer-font">{getRecurrenceLabel(todo.recurrence)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="opacity-0 group-hover:opacity-100 p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all shrink-0"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </motion.div>
                  );
                })
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-24 text-center glass border-dashed bg-transparent rounded-[3rem]"
                >
                   <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-[2rem] shadow-sm mb-6">
                      <ListTodo className="w-10 h-10 text-slate-200" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-800 mb-2 khmer-font">មិនមានកិច្ចការទេ</h3>
                   <p className="text-slate-400 text-sm max-w-[200px] mx-auto khmer-font font-light italic">រីករាយនឹងពេលវេលាសម្រាករបស់អ្នក ឬចាប់ផ្តើមបន្ថែមអ្វីដែលថ្មី។</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}



