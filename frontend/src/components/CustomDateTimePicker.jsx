import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import WheelPicker from './WheelPicker';

export default function CustomDateTimePicker({ value, onChange, onClose }) {
  const [activeView, setActiveView] = useState('date'); // 'date' | 'time'
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  
  // Time states
  const [hours, setHours] = useState(value ? new Date(value).getHours() % 12 || 12 : 12);
  const [minutes, setMinutes] = useState(value ? new Date(value).getMinutes() : 0);
  const [period, setPeriod] = useState(value && new Date(value).getHours() >= 12 ? 'PM' : 'AM');

  // Month navigation
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());


  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();

  const hoursList = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutesList = Array.from({ length: 60 }, (_, i) => i);
  const periodsList = ['AM', 'PM'];


  const handleDateSelect = (day) => {
    const newDate = new Date(viewYear, viewMonth, day);
    setCurrentDate(newDate);
    setActiveView('time');
  };

  const handleTimeConfirm = () => {
    const finalDate = new Date(currentDate);
    let finalHours = hours;
    if (period === 'PM' && finalHours !== 12) finalHours += 12;
    if (period === 'AM' && finalHours === 12) finalHours = 0;
    
    finalDate.setHours(finalHours);
    finalDate.setMinutes(minutes);
    finalDate.setSeconds(0);
    
    onChange(finalDate.toISOString());
    onClose();
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  return (
    <div className="glass rounded-xl p-4 border border-zinc-700 w-72 shadow-2xl relative overflow-hidden">
      <button 
        onClick={onClose}
        className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>

      {/* View Toggle */}
      <div className="flex bg-zinc-900/50 rounded-lg p-1 mb-4 w-3/4">
        <button
          onClick={() => setActiveView('date')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeView === 'date' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <CalendarIcon size={14} /> Date
        </button>
        <button
          onClick={() => setActiveView('time')}
          className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeView === 'time' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Clock size={14} /> Time
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeView === 'date' ? (
          <motion.div
            key="date"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Calendar Header */}
            <div className="flex justify-between items-center mb-4 px-1">
              <button onClick={prevMonth} className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-white">
                {new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-semibold text-zinc-500 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-sm">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = currentDate.getDate() === day && currentDate.getMonth() === viewMonth && currentDate.getFullYear() === viewYear;
                const isToday = new Date().getDate() === day && new Date().getMonth() === viewMonth && new Date().getFullYear() === viewYear;
                
                return (
                  <button
                    key={day}
                    onClick={() => handleDateSelect(day)}
                    className={`h-8 w-full rounded-md flex items-center justify-center transition-all ${
                      isSelected 
                        ? 'bg-cyan-500 text-black font-bold' 
                        : isToday 
                        ? 'bg-zinc-800 text-cyan-400 font-bold border border-cyan-500/30' 
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="time"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center py-4"
          >
            <div className="flex items-center justify-center gap-4 mb-6 w-full px-4">
              <WheelPicker items={hoursList} value={hours} onChange={setHours} infinite={true} />
              <span className="text-2xl font-bold text-zinc-600 pb-2">:</span>
              <WheelPicker items={minutesList} value={minutes} onChange={setMinutes} infinite={true} />
              <div className="ml-2">
                <WheelPicker items={periodsList} value={period} onChange={setPeriod} infinite={false} />
              </div>
            </div>

            <button
              onClick={handleTimeConfirm}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-colors flex justify-center items-center gap-2"
            >
              <Clock size={16} />
              Set Schedule
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
