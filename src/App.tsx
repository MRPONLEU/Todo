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
      console.error("Login Error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert("Domain នេះមិនទាន់ត្រូវបានអនុញ្ញាតក្នុង Firebase ទេ។ សូមបន្ថែម " + window.location.hostname + " ទៅកាន់ Authorized Domains ក្នុង Firebase Console។");
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
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-sm border border-[#eee] max-w-sm w-full text-center"
        >
          <div className="bg-gray-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ListTodo className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-medium mb-2">សូមស្វាគមន៍</h1>
          <p className="text-gray-500 text-sm mb-8">សូមចូលប្រើប្រាស់ដើម្បីរក្សាទុកបញ្ជីការងាររបស់អ្នក</p>
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-black text-white py-3 rounded-xl hover:bg-gray-800 transition-all font-medium"
          >
            <LogIn className="w-5 h-5" />
            <span>ចូលជាមួយ Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header Section */}
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-xl shadow-sm border border-[#eee]">
              <ListTodo className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-medium tracking-tight">បញ្ជីការងារ</h1>
              <p className="text-gray-400 text-xs">{user.displayName || user.email}</p>
            </div>
          </div>
          <button
            onClick={logOut}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="ចាកចេញ"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Input Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#eee] p-3 mb-8 focus-within:ring-2 focus-within:ring-black/5 transition-all">
          <form onSubmit={addTodo} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="តើអ្នកចង់ធ្វើអ្វីនៅថ្ងៃនេះ?"
                className="flex-1 px-4 py-3 bg-transparent outline-none text-sm placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || isAdding}
                className="px-6 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 h-11 self-start"
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">បន្ថែម</span>
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 px-4 pb-1">
               {/* Date Picker */}
               <div className="relative flex items-center gap-2 group">
                  <div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-600 transition-colors">
                    <Calendar className="w-4 h-4" />
                    <label className="text-[11px] font-medium uppercase tracking-wider cursor-pointer">កាលបរិច្ឆេទ:</label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={dueDateInput}
                      onChange={(e) => setDueDateInput(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${dueDateInput ? 'text-blue-600 bg-blue-50' : 'text-gray-400 bg-gray-50'}`}>
                      {dueDateInput || 'មិនទាន់កំណត់'}
                    </span>
                    {dueDateInput && (
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setDueDateInput(''); }}
                        className="ml-1 text-gray-300 hover:text-red-500 z-20 relative"
                      >
                        ×
                      </button>
                    )}
                  </div>
               </div>

               {/* Recurrence Picker */}
               <div className="relative flex items-center gap-2 group">
                  <div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-600 transition-colors">
                    <RotateCcw className="w-4 h-4" />
                    <label className="text-[11px] font-medium uppercase tracking-wider cursor-pointer">ការធ្វើឡើងវិញ:</label>
                  </div>
                  <div className="relative flex items-center">
                    <select
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value as any)}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full"
                    >
                      <option value="none">មិនធ្វើឡើងវិញ</option>
                      <option value="daily">រាល់ថ្ងៃ</option>
                      <option value="weekly">រាល់សប្តាហ៍</option>
                      <option value="monthly">រាល់ខែ</option>
                    </select>
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${recurrence !== 'none' ? 'text-orange-600 bg-orange-50' : 'text-gray-400 bg-gray-50'}`}>
                      {recurrence === 'none' ? 'មិនមាន' : recurrence === 'daily' ? 'រាល់ថ្ងៃ' : recurrence === 'weekly' ? 'រាល់សប្តាហ៍' : 'រាល់ខែ'}
                    </span>
                  </div>
               </div>
            </div>
          </form>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center justify-between">
          <div className="flex p-1 bg-gray-100 rounded-xl w-full sm:w-auto">
            {(['all', 'active', 'completed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filter === f
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f === 'all' ? 'ទាំងអស់' : f === 'active' ? 'កំពុងធ្វើ' : 'បានបញ្ចប់'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ស្វែងរកការងារ..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#eee] rounded-xl text-xs outline-none focus:ring-2 focus:ring-black/5"
            />
          </div>
        </div>

        {/* Todo List Area */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredTodos.length > 0 ? (
              filteredTodos.map((todo) => {
                const dueDateStatus = getDueDateStatus(todo.dueDate);
                return (
                  <motion.div
                    key={todo.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-white p-4 rounded-2xl border border-[#eee] shadow-sm flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <button
                        onClick={() => toggleTodo(todo)}
                        className={`shrink-0 transition-colors ${
                          todo.completed ? 'text-green-500' : 'text-gray-300 group-hover:text-gray-400'
                        }`}
                      >
                        {todo.completed ? (
                          <CheckCircle2 className="w-5 h-5 fill-current bg-white" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-sm truncate transition-all font-medium ${
                            todo.completed ? 'text-gray-400 line-through font-normal' : 'text-gray-800'
                          }`}
                        >
                          {todo.text}
                        </span>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {!todo.completed && dueDateStatus && (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] w-fit font-medium ${dueDateStatus.color}`}>
                              {dueDateStatus.icon}
                              <span>{dueDateStatus.label}</span>
                            </div>
                          )}
                          {!todo.completed && todo.recurrence && todo.recurrence !== 'none' && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] w-fit font-medium bg-orange-50 text-orange-500 border border-orange-100">
                              <RotateCcw className="w-3 h-3" />
                              <span>{getRecurrenceLabel(todo.recurrence)}</span>
                            </div>
                          )}
                          {todo.completed && todo.dueDate && (
                            <div className="text-[10px] text-gray-300 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full">
                              <Calendar className="w-3 h-3" />
                              <span>កាលបរិច្ឆេទ: {todo.dueDate.toDate ? todo.dueDate.toDate().toLocaleDateString('km-KH') : new Date(todo.dueDate).toLocaleDateString('km-KH')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      aria-label="Delete todo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200"
              >
                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ListTodo className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-gray-900 font-medium mb-1">មិនមានការងារទេ</h3>
                <p className="text-gray-400 text-sm">ចាប់ផ្តើមបន្ថែមការងារថ្មីដែលអ្នកចង់ធ្វើ</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Stats */}
        {todos.length > 0 && (
          <footer className="mt-10 pt-6 border-t border-gray-200 flex flex-wrap gap-6 items-center justify-center text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>ទាំងអស់: <b className="text-gray-600 font-medium">{stats.total}</b></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
              <span>កំពុងធ្វើ: <b className="text-gray-600 font-medium">{stats.active}</b></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span>បានបញ្ចប់: <b className="text-gray-600 font-medium">{stats.completed}</b></span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}



