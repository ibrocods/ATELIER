import React, { useState, useEffect, useMemo } from 'react';
import { Joyride } from 'react-joyride';
import type { Step } from 'react-joyride';
import { Search, Plus, FileText, Users, X, Save, Trash2, ChevronRight, ArrowLeft, Sun, Moon, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-error';

// --- Types ---
type Template = {
  id: string;
  name: string;
  fields: string[];
  userId: string;
  createdAt: number;
};

type Measurement = {
  id: string;
  customerId: string;
  templateId: string;
  templateName: string;
  values: Record<string, string>;
  userId: string;
  createdAt: number;
};

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  userId: string;
  createdAt: number;
  measurements?: Measurement[]; // Hydrated
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white">Loading...</div>;
  }

  if (!user) {
    return <LandingPage />;
  }

  return <Dashboard user={user} />;
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

function Dashboard({ user }: { user: User }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    }
    return 'dark';
  });

  const [runTour, setRunTour] = useState(false);
  const [tourSteps, setTourSteps] = useState<Step[]>([]);
  
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenTour');
    if (!hasSeenTour) {
      // Delay slightly to ensure UI is mounted
      setTimeout(() => {
        const isMobile = window.innerWidth < 1024;
        setTourSteps([
          {
            target: isMobile ? '.tour-mobile-clients' : '.tour-desktop-clients',
            content: 'View and manage all your clients and their measurements here.',
            disableBeacon: true,
          },
          {
            target: '.tour-add-client',
            content: 'Click here to add a new client to your atelier.',
            disableBeacon: true,
          },
          {
            target: isMobile ? '.tour-mobile-new-entry' : '.tour-desktop-new-entry',
            content: 'Quickly create a new measurement entry for any client.',
            disableBeacon: true,
          },
          {
            target: isMobile ? '.tour-mobile-templates' : '.tour-desktop-templates',
            content: 'Manage templates for shirts, trousers, and more to speed up your workflow.',
            disableBeacon: true,
          }
        ]);
        setRunTour(true);
      }, 500);
    }
  }, []);

  const handleTourCallback = (data: any) => {
    const { status } = data;
    if (status === 'finished' || status === 'skipped') {
      setRunTour(false);
      localStorage.setItem('hasSeenTour', 'true');
    }
  };

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [activeTab, setActiveTab] = useState<'customers' | 'templates' | 'measure'>('customers');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [rawCustomers, setRawCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  // Real-time listeners
  useEffect(() => {
    if (!user) return;
    
    const unsubs: (() => void)[] = [];
    
    const customersQ = query(collection(db, 'customers'), where('userId', '==', user.uid));
    unsubs.push(onSnapshot(customersQ, (snap) => {
      setRawCustomers(snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toMillis?.() || Date.now() } as Customer)));
    }, err => handleFirestoreError(err, OperationType.GET, 'customers')));

    const templatesQ = query(collection(db, 'templates'), where('userId', '==', user.uid));
    unsubs.push(onSnapshot(templatesQ, (snap) => {
      setTemplates(snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toMillis?.() || Date.now() } as Template)));
    }, err => handleFirestoreError(err, OperationType.GET, 'templates')));

    const measurementsQ = query(collection(db, 'measurements'), where('userId', '==', user.uid));
    unsubs.push(onSnapshot(measurementsQ, (snap) => {
      setMeasurements(snap.docs.map(d => ({ ...d.data(), id: d.id, createdAt: d.data().createdAt?.toMillis?.() || Date.now() } as Measurement)));
    }, err => handleFirestoreError(err, OperationType.GET, 'measurements')));

    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  // Hydrate customers with measurements
  const customers = useMemo(() => {
    return rawCustomers.map(c => ({
      ...c,
      measurements: measurements.filter(m => m.customerId === c.id)
    }));
  }, [rawCustomers, measurements]);

  return (
    <div className="dashboard h-screen w-full lg:grid lg:grid-cols-[240px_1fr_280px] lg:grid-rows-[auto_1fr] lg:gap-4 flex flex-col lg:p-6 p-4 pb-20 lg:pb-6 relative overflow-hidden">
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleTourCallback}
        styles={{
          options: {
            primaryColor: '#000',
            backgroundColor: theme === 'dark' ? '#111' : '#fff',
            textColor: theme === 'dark' ? '#fff' : '#000',
            arrowColor: theme === 'dark' ? '#111' : '#fff',
            overlayColor: 'rgba(0, 0, 0, 0.6)',
          },
          buttonNext: {
            backgroundColor: theme === 'dark' ? '#fff' : '#000',
            color: theme === 'dark' ? '#000' : '#fff',
            fontWeight: 'bold',
            borderRadius: '8px',
          },
          buttonBack: {
            color: theme === 'dark' ? '#ccc' : '#666',
          },
          buttonSkip: {
            color: theme === 'dark' ? '#ccc' : '#666',
          }
        }}
      />
      
      {/* Desktop Sidebar (Left) */}
      <div className="glass hidden lg:flex flex-col p-6 lg:row-span-2 overflow-y-auto">
        <div className="text-xl font-black tracking-tighter mb-8 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full brand-dot transition-all"></div>
          ATELIER
        </div>
        
        <div className={`nav-item tour-desktop-clients ${activeTab === 'customers' && !selectedCustomerId ? 'active' : ''}`} onClick={() => { setActiveTab('customers'); setSelectedCustomerId(null); }}>
          <Users className="w-4 h-4 opacity-70" /> Clients
        </div>
        <div className={`nav-item tour-desktop-templates ${activeTab === 'templates' && !selectedCustomerId ? 'active' : ''}`} onClick={() => { setActiveTab('templates'); setSelectedCustomerId(null); }}>
          <FileText className="w-4 h-4 opacity-70" /> Templates
        </div>
        <div className={`nav-item tour-desktop-new-entry ${activeTab === 'measure' && !selectedCustomerId ? 'active' : ''}`} onClick={() => { setActiveTab('measure'); setSelectedCustomerId(null); }}>
          <Plus className="w-4 h-4 opacity-70" /> New Entry
        </div>

        <div className="mt-auto space-y-2">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="nav-item w-full !justify-start">
            {theme === 'dark' ? <Sun className="w-4 h-4 opacity-70" /> : <Moon className="w-4 h-4 opacity-70" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={logout} className="nav-item w-full !justify-start hover:!text-red-400">
            <LogOut className="w-4 h-4 opacity-70 cursor-pointer" /> Logout
          </button>
        </div>
      </div>

      {/* Main Header */}
      <div className="glass lg:col-start-2 lg:col-span-2 lg:row-start-1 px-4 py-4 mb-4 lg:mb-0 flex justify-between items-center z-40 shrink-0">
        <div className="flex items-center gap-3 lg:hidden">
            <div className="w-3 h-3 rounded-full brand-dot transition-all"></div>
            <h1 className="text-xl font-bold tracking-tight">ATELIER</h1>
        </div>
        <div className="hidden lg:block w-full max-w-md relative">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
           <input 
             type="text" 
             className="search-bar w-full" 
             placeholder="Search customer by name or phone..." 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
           />
        </div>
        <div className="hidden lg:flex gap-4 items-center">
          <span className="text-sm opacity-60">Welcome back{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</span>
          <div className="recent-initials !bg-white !text-black">{user.email?.substring(0, 2).toUpperCase() || 'JD'}</div>
        </div>
        
        {/* Mobile quick actions */}
        <div className="lg:hidden flex items-center gap-2">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 opacity-60 hover:opacity-100">
            {theme === 'dark' ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
          </button>
          <button onClick={logout} className="p-2 opacity-60 hover:opacity-100 hover:text-red-400">
            <LogOut className="w-5 h-5"/>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="glass lg:col-start-2 lg:row-start-2 p-6 overflow-y-auto flex-1 lg:max-h-full">
         <AnimatePresence mode="wait">
           {selectedCustomerId ? (
             <motion.div key="detail" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
               <CustomerDetail 
                 customer={customers.find(c => c.id === selectedCustomerId)!} 
                 user={user}
                 onBack={() => setSelectedCustomerId(null)}
                 onDeleteMeasurement={async (mId) => {
                   try { await deleteDoc(doc(db, 'measurements', mId)); } 
                   catch(e) { handleFirestoreError(e, OperationType.DELETE, `measurements/${mId}`); }
                 }}
                 onDeleteCustomer={async () => {
                   setSelectedCustomerId(null);
                   try {
                     const c = customers.find(c => c.id === selectedCustomerId);
                     if(c && c.measurements) {
                       for(const m of c.measurements) {
                         await deleteDoc(doc(db, 'measurements', m.id));
                       }
                     }
                     await deleteDoc(doc(db, 'customers', selectedCustomerId));
                   } catch(e) { handleFirestoreError(e, OperationType.DELETE, `customers/${selectedCustomerId}`); }
                 }}
               />
             </motion.div>
           ) : activeTab === 'customers' ? (
             <motion.div key="customers" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
               <CustomersView 
                 customers={customers} 
                 user={user}
                 searchQuery={searchQuery}
                 setSearchQuery={setSearchQuery}
                 onSelect={setSelectedCustomerId} 
               />
             </motion.div>
           ) : activeTab === 'templates' ? (
             <motion.div key="templates" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
               <TemplatesView 
                 templates={templates} 
                 user={user}
               />
             </motion.div>
           ) : (
             <motion.div key="measure" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}}>
               <NewMeasurementView 
                 customers={customers}
                 templates={templates}
                 user={user}
                 onSuccess={(custId) => {
                   setSelectedCustomerId(custId);
                   setActiveTab('customers');
                 }}
               />
             </motion.div>
           )}
         </AnimatePresence>
      </div>

      {/* Desktop Templates Sidebar (Right) */}
      <div className="glass hidden lg:flex flex-col p-6 lg:col-start-3 lg:row-start-2 overflow-y-auto">
         <div className="section-label">Saved Templates</div>
         {templates.length === 0 ? (
           <p className="text-xs opacity-40 mb-4">No templates created yet.</p>
         ) : (
           templates.map(t => (
             <div key={t.id} className="template-card transition-colors" onClick={() => { setActiveTab('measure'); setSelectedCustomerId(null); }}>
               <h4>{t.name}</h4>
               <p>{t.fields.length} variables ({t.fields.slice(0,2).join(', ')}...)</p>
             </div>
           ))
         )}
         
         <div className="section-label mt-8">Recent Clients</div>
         {customers.length === 0 ? (
           <p className="text-xs opacity-40">No clients yet.</p>
         ) : (
           [...customers].sort((a,b) => {
             const aLatest = a.measurements && a.measurements.length ? Math.max(...a.measurements.map(m => m.createdAt)) : a.createdAt;
             const bLatest = b.measurements && b.measurements.length ? Math.max(...b.measurements.map(m => m.createdAt)) : b.createdAt;
             return bLatest - aLatest;
           }).slice(0, 5).map(c => (
              <div key={c.id} className="recent-row cursor-pointer transition-colors" onClick={() => { setActiveTab('customers'); setSelectedCustomerId(c.id); }}>
                <div className="recent-initials">{c.name.substring(0,2).toUpperCase()}</div>
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs opacity-50">{(c.measurements || []).length} measurements</div>
                </div>
              </div>
           ))
         )}
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe flex justify-center pointer-events-none">
        <div className="glass !rounded-[30px] w-full max-w-sm flex justify-between items-center px-4 py-2 pointer-events-auto">
          <NavItem 
            icon={<Users className="w-5 h-5" />} 
            label="Clients" 
            isActive={activeTab === 'customers' && !selectedCustomerId} 
            onClick={() => { setActiveTab('customers'); setSelectedCustomerId(null); }} 
            className="tour-mobile-clients"
          />
          <button 
            onClick={() => { setActiveTab('measure'); setSelectedCustomerId(null); }}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 -mt-8 border border-white/20 tour-mobile-new-entry
              ${activeTab === 'measure' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white/10'}`}
          >
            <Plus className="w-6 h-6" />
          </button>
          <NavItem 
            icon={<FileText className="w-5 h-5" />} 
            label="Templates" 
            isActive={activeTab === 'templates' && !selectedCustomerId} 
            onClick={() => { setActiveTab('templates'); setSelectedCustomerId(null); }}
            className="tour-mobile-templates"
          />
        </div>
      </nav>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ icon, label, isActive, onClick, className }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 w-16 py-2 rounded-xl transition-all ${isActive ? '' : 'opacity-40 hover:opacity-70'} ${className || ''}`}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </button>
  );
}

function CustomersView({ customers, user, searchQuery, setSearchQuery, onSelect }: { customers: Customer[], user: User, searchQuery: string, setSearchQuery: (s: string) => void, onSelect: (id: string) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const filtered = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [customers, searchQuery]);

  const handleAddCustomer = async () => {
    if (!newName.trim()) return;
    try {
      const id = generateId();
      await setDoc(doc(db, 'customers', id), {
        userId: user.uid,
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'customers');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Clients</h2>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="btn-primary !px-4 !py-2 !text-sm tour-add-client">
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }} 
            className="glass p-6 space-y-6 overflow-hidden border border-black/10 dark:border-white/20 mb-6"
          >
            <div className="flex justify-between items-center border-b border-black/5 dark:border-white/10 pb-4">
              <h3 className="font-bold text-xl">New Client</h3>
              <button onClick={() => setIsAdding(false)} className="opacity-40 hover:opacity-100 p-2"><X className="w-4 h-4"/></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="input-group">
                <label>Client Name</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input-field"
                  autoFocus
                />
              </div>
              <div className="input-group">
                <label>Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="input-group md:col-span-2">
                <label>Email (Optional)</label>
                <input 
                  type="email" 
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-black/5 dark:border-white/10">
              <button disabled={!newName.trim()} onClick={handleAddCustomer} className="btn-primary w-full max-w-xs">
                 Save Client
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative lg:hidden mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
        <input 
          type="text" 
          placeholder="Search by name..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-bar pl-10!"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 opacity-40">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{searchQuery ? 'No clients found' : 'No clients yet. Add one directly or start a new measurement!'}</p>
          </div>
        ) : (
          filtered.map(customer => (
            <button 
              key={customer.id} 
              onClick={() => onSelect(customer.id)}
              className="glass !p-5 flex items-center justify-between text-left group transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center gap-4">
                <div className="recent-initials !w-10 !h-10 !text-sm">
                  {customer.name.substring(0,2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{customer.name}</h3>
                  <p className="text-sm opacity-50">{(customer.measurements || []).length} order{(customer.measurements || []).length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 opacity-20 group-hover:opacity-60" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0, scale: 0.95}} className="glass p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="opacity-60 mb-8 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium hover:opacity-70 rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-5 py-2 text-sm font-bold bg-black text-red-500 dark:bg-white dark:text-red-600 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-95">Delete</button>
        </div>
      </motion.div>
    </div>
  );
}

function CustomerDetail({ customer, user, onBack, onDeleteMeasurement, onDeleteCustomer }: { 
  customer: Customer, 
  user: User,
  onBack: () => void,
  onDeleteMeasurement: (id: string) => void,
  onDeleteCustomer: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState<{type: 'customer'} | {type: 'measurement', id: string} | null>(null);

  if(!customer) return null;

  return (
    <div className="space-y-8">
      <ConfirmDialog 
        isOpen={confirmDelete !== null}
        title={confirmDelete?.type === 'customer' ? 'Delete Client' : 'Delete Measurement'}
        message={confirmDelete?.type === 'customer' 
          ? `Are you sure you want to delete ${customer.name}? All their measurement records will be permanently lost.`
          : 'Are you sure you want to delete this measurement record?'}
        onConfirm={() => {
          if (confirmDelete?.type === 'customer') {
            onDeleteCustomer();
          } else if (confirmDelete?.type === 'measurement') {
            onDeleteMeasurement(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back to Clients</span>
        </button>
        <button onClick={() => setConfirmDelete({type: 'customer'})} className="p-2 opacity-30 hover:opacity-100 text-red-500 rounded-full transition-all">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="pb-4 border-b border-black/10 dark:border-white/10">
        <h2 className="text-4xl font-light mb-2">{customer.name}</h2>
        {customer.phone && <p className="opacity-50 font-mono text-sm">{customer.phone}</p>}
        {customer.email && <p className="opacity-50 font-sans text-sm">{customer.email}</p>}
        <p className="opacity-40 text-sm mt-2">Reference: #CST-{customer.id.substring(0,4).toUpperCase()}</p>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <h3 className="text-sm font-medium opacity-60 uppercase tracking-widest">Measurement History</h3>
        </div>
        
        {(!customer.measurements || customer.measurements.length === 0) ? (
          <div className="glass p-8 text-center opacity-40 italic text-sm">No measurements recorded.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {[...customer.measurements].sort((a,b) => b.createdAt - a.createdAt).map(m => (
              <div key={m.id} className="glass border-l-4 !border-l-black dark:!border-l-white p-6 space-y-5 relative overflow-hidden group">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-xl mb-1">{m.templateName}</h4>
                    <p className="text-xs opacity-50">{new Date(m.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric'})}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setConfirmDelete({type: 'measurement', id: m.id})}
                      className="opacity-0 group-hover:opacity-100 p-2 opacity-30 hover:opacity-100 text-red-500 transition-all rounded-full"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="template-tag hidden sm:inline-block">ORDER</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-black/5 dark:border-white/10">
                  {Object.entries(m.values).map(([field, value]) => (
                    <div key={field} className="input-group">
                      <label>{field}</label>
                      <div className="input-field !p-3 font-mono text-lg">{value || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatesView({ templates, user }: { templates: Template[], user: User }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<string[]>(['']);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [templates, searchQuery]);

  const handleSave = async () => {
    if (!newName.trim() || newFields.filter(f => f.trim()).length === 0) return;
    const validFields = newFields.map(f => f.trim()).filter(Boolean);
    
    try {
      const id = generateId();
      await setDoc(doc(db, 'templates', id), {
        userId: user.uid,
        name: newName.trim(),
        fields: validFields,
        createdAt: serverTimestamp()
      });
      setIsCreating(false);
      setNewName('');
      setNewFields(['']);
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, 'templates');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'templates', id));
    } catch(e) { handleFirestoreError(e, OperationType.DELETE, `templates/${id}`); }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog 
        isOpen={templateToDelete !== null}
        title="Delete Template"
        message="Are you sure you want to delete this template? Existing measurements using this template will not be affected."
        onConfirm={() => {
          if (templateToDelete) handleDelete(templateToDelete);
          setTemplateToDelete(null);
        }}
        onCancel={() => setTemplateToDelete(null)}
      />
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Measurement Templates</h2>
        {!isCreating && (
          <button onClick={() => setIsCreating(true)} className="btn-primary !px-4 !py-2 !text-sm">
            <Plus className="w-4 h-4" /> New
          </button>
        )}
      </div>

      {!isCreating && templates.length > 0 && (
         <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input 
            type="text" 
            placeholder="Search templates..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-bar pl-10!"
          />
        </div>
      )}

      <AnimatePresence>
        {isCreating && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }} 
            className="glass p-6 space-y-6 overflow-hidden mb-6"
          >
            <div className="flex justify-between items-center border-b border-black/5 dark:border-white/10 pb-4">
              <h3 className="font-bold text-xl">Create Template</h3>
              <button onClick={() => setIsCreating(false)} className="opacity-40 hover:opacity-100 p-2 rounded-full"><X className="w-4 h-4"/></button>
            </div>
            
            <div className="input-group">
              <label>Template Name</label>
              <input 
                type="text" 
                placeholder="e.g. Kaftan, Wedding Dress..." 
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="input-field"
                autoFocus
              />
            </div>

            <div className="input-group">
              <label>Measurement Variables</label>
              <div className="space-y-3">
                {newFields.map((field, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. Waist, Length..." 
                      value={field}
                      onChange={e => {
                        const updated = [...newFields];
                        updated[idx] = e.target.value;
                        setNewFields(updated);
                      }}
                      className="input-field flex-1"
                    />
                    {newFields.length > 1 && (
                      <button onClick={() => setNewFields(newFields.filter((_, i) => i !== idx))} className="px-4 opacity-50 hover:opacity-100 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setNewFields([...newFields, ''])}
                className="mt-4 text-sm font-medium flex items-center gap-2 px-4 py-2 border border-black/10 dark:border-white/10 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 w-fit transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Variable
              </button>
            </div>

            <div className="pt-4 border-t border-black/5 dark:border-white/10">
              <button onClick={handleSave} className="btn-primary w-full max-w-xs">
                 Save Template
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredTemplates.map(template => (
          <div key={template.id} className="template-card !m-0 flex flex-col group h-full relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-lg">{template.name}</h4>
              <button 
                onClick={(e) => { e.stopPropagation(); setTemplateToDelete(template.id); }}
                className="text-red-500 transition-colors p-2 rounded-full opacity-0 group-hover:opacity-100 absolute top-2 right-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
              {template.fields.map(field => (
                <span key={field} className="text-[10px] px-2 py-1 border border-black/10 dark:border-white/20 rounded font-medium opacity-70">
                  {field}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filteredTemplates.length === 0 && !isCreating && templates.length > 0 && (
           <div className="col-span-full border border-dashed border-black/20 dark:border-white/20 rounded-2xl p-12 text-center opacity-50">
             No templates found matching your search.
           </div>
        )}
        {templates.length === 0 && !isCreating && (
           <div className="col-span-full border border-dashed border-black/20 dark:border-white/20 rounded-2xl p-12 text-center opacity-50">
             No templates yet. Create your first one to start measuring.
           </div>
        )}
      </div>
    </div>
  );
}

function NewMeasurementView({ customers, templates, user, onSuccess }: { 
  customers: Customer[], 
  templates: Template[],
  user: User,
  onSuccess: (customerId: string) => void
}) {
  const [customerName, setCustomerName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const matchingCustomers = useMemo(() => {
    if (!customerName.trim()) return [];
    return customers.filter(c => c.name.toLowerCase().includes(customerName.toLowerCase())).slice(0, 5);
  }, [customerName, customers]);

  const activeTemplate = templates.find(t => t.id === selectedTemplateId);

  useEffect(() => {
    if (activeTemplate) {
      const initial: Record<string, string> = {};
      activeTemplate.fields.forEach(f => initial[f] = '');
      setMeasurements(initial);
    } else {
      setMeasurements({});
    }
  }, [activeTemplate]);

  const handleSave = async () => {
    if (!customerName.trim() || !activeTemplate) return;

    try {
      let existingCustomer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase().trim());
      let customerId = existingCustomer?.id || generateId();

      if (!existingCustomer) {
        await setDoc(doc(db, 'customers', customerId), {
          userId: user.uid,
          name: customerName.trim(),
          phone: '',
          email: '',
          createdAt: serverTimestamp()
        });
      }

      const mId = generateId();
      await setDoc(doc(db, 'measurements', mId), {
        userId: user.uid,
        customerId: customerId,
        templateId: activeTemplate.id,
        templateName: activeTemplate.name,
        values: measurements,
        createdAt: serverTimestamp()
      });

      onSuccess(customerId);
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, 'measurements');
    }
  };

  if (templates.length === 0) {
    return (
      <div className="text-center py-20 opacity-50 glass p-8">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-bold mb-2">No Templates Found</h3>
        <p>Please create a measurement template first before recording a new entry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      
      <div className="sheet-title mb-6">
        <span>New Measurement</span>
        {activeTemplate && <span className="template-tag">{activeTemplate.name}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="input-group relative">
          <label>1. Client Name</label>
          <input 
            type="text" 
            placeholder="Start typing name..." 
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="input-field !font-sans !font-medium"
          />
          {showSuggestions && matchingCustomers.length > 0 && (
            <div className="absolute top-[80px] left-0 right-0 glass p-2 space-y-1 z-50 shadow-2xl">
              {matchingCustomers.map(c => (
                <button 
                  key={c.id}
                  onClick={() => {
                    setCustomerName(c.name);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-sm font-medium transition-colors"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="input-group">
          <label>2. Template Options</label>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 relative z-0">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={`template-card !m-0 !p-3 text-center transition-all ${selectedTemplateId === t.id ? 'active border-[2px]' : ''}`}
              >
                <h4 className="!text-xs truncate">{t.name}</h4>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeTemplate && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass p-8 mt-8 border-t-[4px] border-t-black dark:border-t-white">
             <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/5 dark:border-white/10">
               <h3 className="font-bold text-xl">3. Variables</h3>
               <span className="text-xs px-3 py-1 bg-black/5 dark:bg-white/10 rounded-full font-medium">inches / cm</span>
             </div>
             
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6">
               {activeTemplate.fields.map(field => (
                 <div key={field} className="input-group">
                   <label title={field}>{field}</label>
                   <input 
                     type="text" 
                     inputMode="decimal"
                     value={measurements[field] || ''}
                     onChange={e => setMeasurements({...measurements, [field]: e.target.value})}
                     className="input-field text-center font-bold text-xl"
                     placeholder="-"
                   />
                 </div>
               ))}
             </div>

             <div className="mt-10 pt-6 border-t border-black/5 dark:border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-end">
               <button 
                 onClick={handleSave}
                 disabled={!customerName.trim()}
                 className="btn-primary w-full sm:w-auto min-w-[200px]"
               >
                 <Save className="w-5 h-5" /> Save Measurement
               </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const LANDING_SLIDES = [
  {
    title: "Stop writing measurements on paper",
    subtitle: "Save, organize, and reuse customer measurements easily.",
    image: "/tailor.jpg" // Tailor working on suit
  },
  {
    title: "Tailored to your workflow",
    subtitle: "Create specific measurement sets for shirts, trousers, suits, and more.",
    image: "/tailor2.jpg" // Tailor workshop/measuring
  },
  {
    title: "Your atelier in the cloud",
    subtitle: "Access your clients' profiles securely from any device, anywhere.",
    image: "/tailor3.jpg" // Sewing machine/needle
  }
];

function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % LANDING_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen relative bg-[#050505] text-white overflow-hidden flex flex-col justify-end">
      {/* Background Images */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 0.6, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            <img
              src={LANDING_SLIDES[currentSlide].image}
              alt="Tailoring"
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent z-10 pointer-events-none"></div>
      </div>

      {/* Header / Logo */}
      <div className="absolute top-8 left-8 md:top-12 md:left-12 lg:left-24 z-20 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-white shadow-[0_0_20px_#fff]"></div>
        <span className="font-black tracking-widest text-2xl drop-shadow-lg">ATELIER</span>
      </div>

      {/* Content Overlay */}
      <div className="relative z-20 w-full px-8 pb-12 md:pb-24 lg:pb-32 md:px-16 lg:px-24 max-w-4xl">
        
        <div className="min-h-[140px] md:min-h-[160px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl md:text-6xl lg:text-6xl font-black tracking-tighter mb-4 leading-[1.1] text-white drop-shadow-xl">
                {LANDING_SLIDES[currentSlide].title}
              </h1>
              <p className="text-lg md:text-2xl text-white/80 drop-shadow-md max-w-2xl">
                {LANDING_SLIDES[currentSlide].subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots */}
        <div className="flex gap-2 my-8">
          {LANDING_SLIDES.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentSlide ? 'w-10 bg-white' : 'w-3 bg-white/30'}`}
            />
          ))}
        </div>

        <button onClick={loginWithGoogle} className="group relative w-full sm:w-auto py-4 px-8 text-lg md:text-xl font-bold flex items-center justify-center gap-4 bg-white text-black rounded-2xl hover:bg-white/90 transition-all duration-300 transform hover:scale-[1.02] active:scale-95 shadow-2xl">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
