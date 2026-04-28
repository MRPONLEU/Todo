/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  LogOut, 
  LogIn, 
  Loader2, 
  Package, 
  Printer, 
  ShoppingCart, 
  LayoutDashboard, 
  History,
  TrendingUp,
  User as UserIcon,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
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
  serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

// Types
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  imageUrl?: string;
  ownerId: string;
  createdAt: any;
}

interface Order {
  id: string;
  customerName?: string;
  description: string;
  quantity: number;
  totalPrice: number;
  status: 'pending' | 'in-progress' | 'completed';
  ownerId: string;
  createdAt: any;
}

interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Sale {
  id: string;
  items: SaleItem[];
  totalAmount: number;
  ownerId: string;
  createdAt: any;
}

type TabType = 'pos' | 'orders' | 'inventory' | 'stats';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  
  // POS State
  const [cart, setCart] = useState<SaleItem[]>([]);
  
  // Form States
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 600KB to ensure Base64 string + metadata stays under 1MB Firestore limit
    if (file.size > 600000) { 
      alert("រូបភាពធំពេក! សូមប្រើរូបភាពដែលមានទំហំតូចជាង 600KB ដើម្បីរក្សាទុកបានជោគជ័យ។");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setProductImageUrl(reader.result as string);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };
  
  const [orderCustomer, setOrderCustomer] = useState('');
  const [orderDesc, setOrderDesc] = useState('');
  const [orderQty, setOrderQty] = useState('1');
  const [orderPrice, setOrderPrice] = useState('');
  
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const productsQ = query(
      collection(db, 'products'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const ordersQ = query(
      collection(db, 'orders'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const salesQ = query(
      collection(db, 'sales'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubProducts = onSnapshot(productsQ, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    const unsubOrders = onSnapshot(ordersQ, (snapshot) => {
      setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    });
    const unsubSales = onSnapshot(salesQ, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    return () => { unsubProducts(); unsubOrders(); unsubSales(); };
  }, [user]);

  // Actions
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: product.price, 
        quantity: 1 
      }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const checkout = async () => {
    if (cart.length === 0 || !user) return;
    setIsSubmitting(true);
    try {
      const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // 1. Create Sale
      await addDoc(collection(db, 'sales'), {
        items: cart,
        totalAmount,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });

      // 2. Update Stock (Simple sequential update)
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          await updateDoc(doc(db, 'products', product.id), {
            stock: Math.max(0, product.stock - item.quantity)
          });
        }
      }

      setCart([]);
      alert('ការលក់ត្រូវបានកត់ត្រាទុកដោយជោគជ័យ!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sales/products');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !productName || !productPrice) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'products'), {
        name: productName,
        price: Number(productPrice),
        stock: Number(productStock) || 0,
        imageUrl: productImageUrl,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setProductName(''); setProductPrice(''); setProductStock(''); setProductImageUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'products');
    } finally { setIsSubmitting(false); }
  };

  const addOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orderDesc || !orderPrice) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'orders'), {
        customerName: orderCustomer,
        description: orderDesc,
        quantity: Number(orderQty),
        totalPrice: Number(orderPrice),
        status: 'pending',
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setOrderCustomer(''); setOrderDesc(''); setOrderQty('1'); setOrderPrice('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally { setIsSubmitting(false); }
  };

  const updateOrderStatus = async (id: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', id), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const deleteItem = async (col: string, id: string) => {
    if (!confirm('តើអ្នកប្រាកដថាចង់លុបមែនទេ?')) return;
    try {
      await deleteDoc(doc(db, col, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${col}/${id}`);
    }
  };

  const handleSignIn = async () => {
    try { await signIn(); } catch (error: any) { alert("Login Error: " + error.message); }
  };

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass p-12 rounded-[2.5rem] max-w-md w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
          <div className="bg-indigo-50 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner ring-4 ring-white">
            <ShoppingCart className="w-12 h-12 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold mb-3 text-slate-800 khmer-font">ហាងសម្ភារៈសិក្សា</h1>
          <p className="text-slate-500 text-base mb-10 khmer-font font-light italic">គ្រប់គ្រងការលក់ និងសេវាកម្មថតចម្លងបានយ៉ាងងាយស្រួល។</p>
          <button onClick={handleSignIn} className="w-full flex items-center justify-center gap-4 bg-slate-900 text-white py-4 rounded-2xl hover:bg-slate-800 transition-all font-semibold shadow-lg">
            <LogIn className="w-6 h-6" />
            <span className="khmer-font">ចូលជាមួយ Google</span>
          </button>
        </motion.div>
      </div>
    );
  }

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredOrders = orders.filter(o => o.description.toLowerCase().includes(search.toLowerCase()) || o.customerName?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 md:pb-0">
      {/* Sidebar - Desktop */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-white hidden lg:flex flex-col p-6 z-20">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="bg-indigo-500 p-2 rounded-xl">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold khmer-font">ហាងសម្ភារៈ</h1>
        </div>

        <nav className="space-y-2 flex-grow">
          <NavItem icon={<LayoutDashboard />} label="ការលក់ (POS)" active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
          <NavItem icon={<Printer />} label="សេវាកម្ម (Copy)" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
          <NavItem icon={<Package />} label="បញ្ជីទំនិញ" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
          <NavItem icon={<History />} label="របាយការណ៍" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
        </nav>

        <div className="mt-auto border-t border-slate-800 pt-6">
          <div className="flex items-center gap-3 mb-6 px-2">
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border-2 border-indigo-500" alt="" referrerPolicy="no-referrer" />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate khmer-font">{user.displayName}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{user.email?.split('@')[0]}</p>
            </div>
          </div>
          <button onClick={logOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-all text-sm font-bold">
            <LogOut className="w-4 h-4" />
            <span className="khmer-font">ចាកចេញ</span>
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="lg:pl-64 min-h-screen">
        <header className="sticky top-0 glass z-10 px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <h2 className="text-2xl font-black text-slate-800 khmer-font leading-none">
            {activeTab === 'pos' ? 'ការលក់ទំនិញ' : activeTab === 'orders' ? 'ការងារថតចម្លង' : activeTab === 'inventory' ? 'គ្រប់គ្រងទំនិញ' : 'របាយការណ៍'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative group hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder="ស្វែងរក..." 
                className="pl-10 pr-4 py-2 bg-slate-100 rounded-xl text-sm outline-none w-48 focus:w-64 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 transition-all khmer-font"
              />
            </div>
          </div>
        </header>

        <main className="p-6 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'pos' && (
              <motion.div key="pos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col lg:flex-row gap-8">
                {/* Product Catalog */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-800 khmer-font">ជ្រើសរើសទំនិញ</h3>
                    <div className="lg:hidden text-indigo-600">
                      <div className="relative">
                        <ShoppingCart className="w-6 h-6" />
                        {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center">{cart.length}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => addToCart(p)}
                        className="glass overflow-hidden rounded-3xl text-left hover:border-indigo-500 hover:shadow-xl transition-all group active:scale-95 flex flex-col"
                      >
                        <div className="relative h-40 w-full bg-slate-100 overflow-hidden">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Package className="w-12 h-12" />
                            </div>
                          )}
                          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm">
                            <p className="text-sm font-black text-indigo-600">${p.price.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="p-5">
                          <h3 className="font-bold text-slate-800 mb-1 khmer-font text-base truncate">{p.name}</h3>
                          <p className={`text-[10px] uppercase font-black tracking-widest khmer-font ${p.stock < 10 ? 'text-red-500' : 'text-slate-400'}`}>ស្តុក៖ {p.stock}</p>
                        </div>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-full py-20 text-center glass rounded-3xl border-dashed">
                        <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 khmer-font italic">មិនទាន់មានទំនិញលក់នៅឡើយ</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Shopping Cart Side Panel */}
                <div className="lg:w-[400px] shrink-0">
                  <div className="glass p-7 rounded-[2.5rem] sticky top-24 shadow-2xl shadow-indigo-100/50 flex flex-col h-[calc(100vh-12rem)] min-h-[550px]">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-2xl font-black text-slate-800 khmer-font">កន្ត្រកទំនិញ</h3>
                      <div className="bg-indigo-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)} Items
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                      {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-30">
                          <ShoppingCart className="w-16 h-16 mb-4 text-slate-300" />
                          <p className="text-sm khmer-font font-medium uppercase tracking-widest text-slate-400">កន្ត្រកទទេស្អាត</p>
                        </div>
                      ) : (
                        cart.map((item) => (
                          <div key={item.productId} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50/50 border border-slate-100">
                             <div className="flex-1 min-w-0">
                               <p className="font-bold text-slate-800 truncate khmer-font">{item.name}</p>
                               <p className="text-xs font-black text-indigo-500">${item.price.toFixed(2)}</p>
                             </div>
                             <div className="flex items-center gap-2 bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
                               <button onClick={() => updateCartQty(item.productId, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">-</button>
                               <span className="text-sm font-black w-5 text-center text-slate-700">{item.quantity}</span>
                               <button onClick={() => updateCartQty(item.productId, 1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-xl text-slate-400 transition-colors">+</button>
                             </div>
                             <button onClick={() => removeFromCart(item.productId)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                               <Trash2 className="w-5 h-5" />
                             </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-100 space-y-6">
                      <div className="flex justify-between items-center px-2">
                        <span className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] khmer-font">សរុបការទូទាត់</span>
                        <span className="text-4xl font-black text-slate-900 leading-none">
                          <span className="text-indigo-500 text-lg mr-1">$</span>
                          {cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                      <button 
                        onClick={checkout}
                        disabled={cart.length === 0 || isSubmitting}
                        className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-lg hover:bg-slate-800 disabled:opacity-50 disabled:grayscale transition-all shadow-xl shadow-slate-200 khmer-font flex items-center justify-center gap-4 active:scale-95"
                      >
                        {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShoppingCart className="w-6 h-6" />}
                        បញ្ជាក់ការបង់ប្រាក់
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'orders' && (
              <motion.div key="orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <motion.div className="glass p-6 rounded-[2rem] shadow-xl shadow-slate-200/50">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 khmer-font">បញ្ចូលសេវាកម្មថ្មី (Copy/Print)</h3>
                  <form onSubmit={addOrder} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input type="text" value={orderCustomer} onChange={e => setOrderCustomer(e.target.value)} placeholder="ឈ្មោះអតិថិជន" className="px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                    <input type="text" value={orderDesc} onChange={e => setOrderDesc(e.target.value)} placeholder="បរិយាយ (e.g. Copy សៀវភៅ)" required className="px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm md:col-span-2" />
                    <div className="grid grid-cols-2 gap-2">
                       <input type="number" value={orderQty} onChange={e => setOrderQty(e.target.value)} placeholder="ចំនួន" className="px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                       <input type="number" step="0.01" value={orderPrice} onChange={e => setOrderPrice(e.target.value)} placeholder="តម្លៃសរុប ($)" required className="px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                    </div>
                    <button disabled={isSubmitting} type="submit" className="md:col-start-4 bg-indigo-600 text-white rounded-2xl py-3 font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 khmer-font shadow-lg shadow-indigo-100">
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                      បន្ថែមការងារ
                    </button>
                  </form>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredOrders.map(o => (
                    <div key={o.id} className="glass p-5 rounded-3xl flex items-start gap-4 hover:shadow-lg transition-all border-l-4 border-l-indigo-500">
                      <div className={`p-3 rounded-2xl ${o.status === 'completed' ? 'bg-green-50 text-green-500' : o.status === 'in-progress' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
                        {o.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : o.status === 'in-progress' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Clock className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-slate-800 truncate khmer-font">{o.description}</h4>
                          <p className="text-lg font-black text-slate-900">${o.totalPrice.toFixed(2)}</p>
                        </div>
                        <p className="text-xs text-slate-400 khmer-font mb-3">អតិថិជន៖ {o.customerName || 'ទូទៅ'} • ចំនួន៖ {o.quantity}</p>
                        <div className="flex gap-2">
                          {o.status === 'pending' && <button onClick={() => updateOrderStatus(o.id, 'in-progress')} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase khmer-font">កំពុងធ្វើ</button>}
                          {o.status !== 'completed' && <button onClick={() => updateOrderStatus(o.id, 'completed')} className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold uppercase khmer-font">បានរួចរាល់</button>}
                          <button onClick={() => deleteItem('orders', o.id)} className="ml-auto p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'inventory' && (
              <motion.div key="inventory" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="glass p-6 rounded-[2rem] shadow-xl shadow-slate-200/50">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 khmer-font">បន្ថែមទំនិញថ្មី</h3>
                  <form onSubmit={addProduct} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="ឈ្មោះទំនិញ" required className="w-full px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                        <div className="grid grid-cols-2 gap-4">
                          <input type="number" step="0.01" value={productPrice} onChange={e => setProductPrice(e.target.value)} placeholder="តម្លៃ ($)" required className="w-full px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                          <input type="number" value={productStock} onChange={e => setProductStock(e.target.value)} placeholder="ក្នុងស្តុក" className="w-full px-4 py-3 bg-slate-50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 khmer-font text-sm" />
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="w-24 h-24 rounded-xl bg-white flex items-center justify-center overflow-hidden border border-slate-100 flex-shrink-0">
                          {productImageUrl ? (
                            <img src={productImageUrl} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-8 h-8 text-slate-200" />
                          )}
                        </div>
                        <div className="flex-1 w-full flex flex-col gap-2">
                          <label className="text-xs font-bold text-slate-400 khmer-font uppercase tracking-widest">រូបភាពផលិតផល</label>
                          <div className="flex gap-2">
                             <input 
                               type="file" 
                               accept="image/*" 
                               onChange={handleFileChange} 
                               id="file-upload"
                               className="hidden" 
                             />
                             <label 
                               htmlFor="file-upload" 
                               className="flex-1 text-center bg-white border border-slate-200 text-slate-600 py-2.5 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-50 transition-all khmer-font"
                             >
                               {isUploading ? "កំពុងដំណើរការ..." : "ជ្រើសរើសរូបភាព"}
                             </label>
                             {productImageUrl && (
                               <button 
                                 type="button" 
                                 onClick={() => setProductImageUrl('')}
                                 className="px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-all khmer-font"
                               >
                                 លុប
                               </button>
                             )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button disabled={isSubmitting || isUploading} type="submit" className="w-full md:w-auto px-12 bg-slate-900 text-white rounded-2xl py-3.5 font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 khmer-font shadow-lg">
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                      បញ្ជាក់ទំនិញ
                    </button>
                  </form>
                </div>

                <div className="glass rounded-[2rem] overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 khmer-font">ឈ្មោះទំនិញ</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 khmer-font text-right">តម្លៃ</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 khmer-font text-center">ក្នុងស្តុក</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 khmer-font text-right">សកម្មភាព</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Package size={20} />
                                  </div>
                                )}
                              </div>
                              <span className="font-bold text-slate-700 khmer-font truncate">{p.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-indigo-600">${p.price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${p.stock < 10 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-500'}`}>{p.stock}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => deleteItem('products', p.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div key="stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard icon={<TrendingUp />} label="ចំណូលសរុប (ការលក់)" value={`$${sales.reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2)}`} color="bg-indigo-50 text-indigo-600" />
                  <StatCard icon={<ShoppingCart />} label="ចំនួនការលក់សរុប" value={sales.length} color="bg-green-50 text-green-600" />
                  <StatCard icon={<Printer />} label="ចំណូលពីសេវាកម្ម (Copy)" value={`$${orders.reduce((sum, o) => sum + o.totalPrice, 0).toFixed(2)}`} color="bg-blue-50 text-blue-600" />
                </div>
                
                <h3 className="text-xl font-bold text-slate-800 khmer-font mt-10 mb-4">ប្រវត្តិនៃការលក់ចុងក្រោយ</h3>
                <div className="space-y-3">
                  {sales.map(s => (
                    <div key={s.id} className="glass p-5 rounded-3xl flex justify-between items-center group hover:border-indigo-200 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                          <History className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-800 khmer-font">ប្រតិបត្តិការ #{s.id.slice(-6).toUpperCase()}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.items.length} លំដាប់ទំនិញ</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-slate-900 leading-none">${s.totalAmount.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">
                          {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleTimeString('km-KH') : 'ទើបតែកើតឡើង'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {sales.length === 0 && (
                    <div className="py-24 text-center glass rounded-3xl border-dashed opacity-50">
                      <History className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400 khmer-font italic">មិនទាន់មានប្រវត្តិលក់នៅឡើយ</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom Nav - Mobile */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-slate-100 px-6 py-4 flex justify-between items-center lg:hidden z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
        <MobileNavItem icon={<LayoutDashboard />} active={activeTab === 'pos'} onClick={() => setActiveTab('pos')} />
        <MobileNavItem icon={<Printer />} active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} />
        <MobileNavItem icon={<Package />} active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
        <MobileNavItem icon={<History />} active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
      </div>
    </div>
  );
}

// Subcomponents
function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-3xl text-sm font-bold transition-all ${
        active 
          ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40 translate-x-1' 
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {React.cloneElement(icon, { size: 20, strokeWidth: 2.5 })}
      <span className="khmer-font">{label}</span>
    </button>
  );
}

function MobileNavItem({ icon, active, onClick }: { icon: any, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-2xl transition-all active:scale-90 ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
    >
      {React.cloneElement(icon, { size: 24, strokeWidth: 2.5 })}
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  return (
    <div className="glass p-7 rounded-[2.5rem] flex items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-5 rounded-3xl ${color}`}>
        {React.cloneElement(icon, { size: 28, strokeWidth: 2.5 })}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 khmer-font">{label}</p>
        <p className="text-3xl font-black text-slate-800 leading-none">{value}</p>
      </div>
    </div>
  );
}



