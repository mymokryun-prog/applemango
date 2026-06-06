/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Gamepad2, Volume2, RotateCcw, HelpCircle, ArrowLeft, Music, Music2 } from 'lucide-react';
import { getLocationSocket } from '../realtime/socketClient';

interface Player {
  id: number;
  name: string;
  x: number;
  y: number;
  color: string;
  hp: number;
  angle: number;
  power: number;
  moveFuel: number;
  bullets: number;
  skills: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
}

interface TetrisParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
}

// Web Audio API custom synthesizer class for Yut Nori & general sounds
class AudioSynth {
  ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playShoot() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  playExplosion() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Noise buffer
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.6);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.6);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start();
    noiseSource.stop(ctx.currentTime + 0.6);
  }

  playVictory() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
    });
  }

  // Upbeat dynamic folk-style synthesizer arpeggios for Yut Nori throws
  playYutThrow() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Swishing noise sweep (바람 소리)
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.45);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.45);

    // 2. Powerful dynamic traditional major chord sweep (Sawtooth/Triangle chords)
    const notes = [220.00, 277.18, 329.63, 440.00, 554.37, 659.25, 880.00]; // A3 C#4 E4 A4 C#5 E5 A5 (Rich traditional chord)
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04);
      osc.frequency.linearRampToValueAtTime(freq * 1.2, ctx.currentTime + idx * 0.04 + 0.25);
      
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(freq / 2, ctx.currentTime + idx * 0.04);
      
      gain.gain.setValueAtTime(0.25, ctx.currentTime + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.04 + 0.25);
      
      osc.start(ctx.currentTime + idx * 0.04);
      osc.stop(ctx.currentTime + idx * 0.04 + 0.3);
      subOsc.start(ctx.currentTime + idx * 0.04);
      subOsc.stop(ctx.currentTime + idx * 0.04 + 0.3);
    });
  }

  playYutWoodSound() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    
    // Thud sound (쿵)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(150, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);
    gain1.gain.setValueAtTime(0.5, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.12);

    // Click sound (탁)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(900, ctx.currentTime);
    osc2.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc2.start();
    osc2.stop(ctx.currentTime + 0.08);
  }
}

// Web Audio API custom synthesizer class for Tetris
class TetrisAudioSynth {
  ctx: AudioContext | null = null;
  isPlaying: boolean = false;
  noteIndex: number = 0;
  timerId: any = null;
  isMuted: boolean = false;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  melody = [
    ['E5', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['C5', 1], ['B4', 1],
    ['A4', 2], ['A4', 1], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 3], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 4],
    
    ['D5', 3], ['F5', 1], ['A5', 2], ['G5', 1], ['F5', 1],
    ['E5', 3], ['C5', 1], ['E5', 2], ['D5', 1], ['C5', 1],
    ['B4', 2], ['B4', 1], ['C5', 1], ['D5', 2], ['E5', 2],
    ['C5', 2], ['A4', 2], ['A4', 4]
  ];

  frequencies: Record<string, number> = {
    'A4': 440.00, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00
  };

  start(muted: boolean) {
    this.isMuted = muted;
    if (this.isPlaying) return;
    this.init();
    if (!this.ctx) return;
    this.isPlaying = true;
    this.noteIndex = 0;
    
    const playNextNote = () => {
      if (!this.isPlaying || !this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      
      const current = this.melody[this.noteIndex];
      const noteName = current[0] as string;
      const durationMult = current[1] as number;
      const baseTick = 160; 
      const duration = baseTick * durationMult;
      
      if (!this.isMuted && this.frequencies[noteName]) {
        try {
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(this.frequencies[noteName], this.ctx.currentTime);
          
          gainNode.gain.setValueAtTime(0.04, this.ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (duration / 1000) - 0.02);
          
          osc.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          
          osc.start();
          osc.stop(this.ctx.currentTime + (duration / 1000));
        } catch (e) {
          console.warn('Synth error:', e);
        }
      }
      
      this.noteIndex = (this.noteIndex + 1) % this.melody.length;
      this.timerId = setTimeout(playNextNote, duration);
    };
    
    playNextNote();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  playLineClear() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = [523.25, 659.25, 783.99, 1046.50]; 
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.05 + 0.15);
      osc.start(ctx.currentTime + idx * 0.05);
      osc.stop(ctx.currentTime + idx * 0.05 + 0.2);
    });
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = [392.00, 349.23, 311.13, 261.63]; 
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + idx * 0.15);
      gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.25);
      osc.start(ctx.currentTime + idx * 0.15);
      osc.stop(ctx.currentTime + idx * 0.15 + 0.3);
    });
  }
}

// ==========================================
// 1. DRONE BATTLE GAME SUBCOMPONENT
// ==========================================
interface DroneCrashGameProps {
  onBack: () => void;
  friends: any[];
  activeProfileId: string;
  activeRoomId: string;
  multiplayerConfig: { game: 'drone_battle' | 'yut_nori'; opponentId: string; role: 'p1' | 'p2' } | null;
  onResetMultiplayer: () => void;
}

function DroneCrashGame({ 
  onBack, 
  friends, 
  activeProfileId, 
  activeRoomId, 
  multiplayerConfig, 
  onResetMultiplayer 
}: DroneCrashGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthRef = useRef<AudioSynth | null>(null);

  const gameStateRef = useRef<{
    terrain: number[];
    backgroundMountains: number[];
    players: Player[];
    turn: number;
    isGameOver: boolean;
    isFlying: boolean;
    isRolling: boolean;
    projX: number;
    projY: number;
    projVx: number;
    projVy: number;
    isSkillShot: boolean;
    rollTimer: number;
    particles: Particle[];
    shakeDuration: number;
    shakeIntensity: number;
  }>({
    terrain: [],
    backgroundMountains: [],
    players: [],
    turn: 0,
    isGameOver: false,
    isFlying: false,
    isRolling: false,
    projX: 0,
    projY: 0,
    projVx: 0,
    projVy: 0,
    isSkillShot: false,
    rollTimer: 0,
    particles: [],
    shakeDuration: 0,
    shakeIntensity: 0
  });

  const [turn, setTurn] = useState(0);
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(70);
  const [useSkill, setUseSkill] = useState(false);
  const [skillCount, setSkillCount] = useState(1);
  const [moveFuel, setMoveFuel] = useState(100);
  const [playerHp, setPlayerHp] = useState<number[]>([100, 100]);
  const [isFiringState, setIsFiringState] = useState(false);
  const [gameOverMsg, setGameOverMsg] = useState<string | null>(null);
  const isGameOver = gameOverMsg !== null;

  // 4차 개선 추가 상태
  const [selectedTerrainIdx, setSelectedTerrainIdx] = useState<number>(0);
  const [matchScores, setMatchScores] = useState<number[]>([0, 0]);
  const [bullets, setBullets] = useState<number[]>([20, 20]);

  const powerMultiplier = 0.38;
  const isMultiplayer = !!multiplayerConfig;
  const myPlayerIdx = isMultiplayer ? (multiplayerConfig.role === 'p1' ? 0 : 1) : 0;
  const isMyTurn = !isGameOver && (!isMultiplayer || turn === myPlayerIdx);

  useEffect(() => {
    synthRef.current = new AudioSynth();
    initGame();
  }, [selectedTerrainIdx]);

  useEffect(() => {
    const socket = getLocationSocket();
    const handleActionSync = (payload: any) => {
      if (!isMultiplayer) return;
      if (payload.type === 'sync-drone-action') {
        const state = gameStateRef.current;
        if (payload.actionType === 'move') {
          const opponentIdx = myPlayerIdx === 0 ? 1 : 0;
          const opp = state.players[opponentIdx];
          if (opp) {
            opp.x = payload.x;
            opp.y = payload.y;
            opp.moveFuel = payload.fuel;
            if (turn === opponentIdx) setMoveFuel(payload.fuel);
          }
        } else if (payload.actionType === 'angle') {
          const opponentIdx = myPlayerIdx === 0 ? 1 : 0;
          if (turn === opponentIdx) {
            setAngle(payload.angle);
            state.players[opponentIdx].angle = payload.angle;
          }
        } else if (payload.actionType === 'power') {
          const opponentIdx = myPlayerIdx === 0 ? 1 : 0;
          if (turn === opponentIdx) {
            setPower(payload.power);
            state.players[opponentIdx].power = payload.power;
          }
        } else if (payload.actionType === 'skill') {
          const opponentIdx = myPlayerIdx === 0 ? 1 : 0;
          if (turn === opponentIdx) {
            state.players[opponentIdx].skills = payload.count;
            setSkillCount(payload.count);
          }
        } else if (payload.actionType === 'fire') {
          localFireAction(true);
        } else if (payload.actionType === 'terrain') {
          setSelectedTerrainIdx(payload.terrainType);
        }
      }
    };

    socket.on('game-relayed', handleActionSync);
    return () => {
      socket.off('game-relayed', handleActionSync);
    };
  }, [isMultiplayer, myPlayerIdx, turn, isFiringState, useSkill]);

  const generateMountains = (width: number) => {
    const mountains = [];
    for (let x = 0; x <= width; x += 15) {
      mountains.push(330 + Math.sin(x / 100) * 80 + Math.cos(x / 180) * 40);
    }
    return mountains;
  };

  const updateTankY = (player: Player, terrain: number[]) => {
    let cx = Math.floor(player.x);
    if (cx < 0) cx = 0;
    if (cx >= terrain.length) cx = terrain.length - 1;
    player.y = terrain[cx];
  };

  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;

    const mountains = generateMountains(width);
    const newTerrain: number[] = [];

    if (selectedTerrainIdx === 1) {
      for (let x = 0; x < width; x++) {
        newTerrain[x] = 680;
      }
    } else if (selectedTerrainIdx === 2) {
      const mid = width / 2;
      for (let x = 0; x < width; x++) {
        const dist = Math.abs(x - mid);
        const baseGround = 820 + Math.sin(x / 100) * 15;
        let mountainHeight = 0;
        if (dist < 600) {
          mountainHeight = 480 * Math.pow(Math.cos((dist * Math.PI) / 1200), 2);
        }
        newTerrain[x] = baseGround - mountainHeight + Math.random() * 3;
      }
    } else if (selectedTerrainIdx === 3) {
      const mid = width / 2;
      for (let x = 0; x < width; x++) {
        const dist = Math.abs(x - mid);
        const baseGround = 520 + Math.sin(x / 120) * 15;
        let valleyDepth = 0;
        if (dist < 700) {
          valleyDepth = 250 * Math.pow(Math.cos((dist * Math.PI) / 1400), 2);
        }
        newTerrain[x] = baseGround + valleyDepth + Math.random() * 3;
      }
    } else if (selectedTerrainIdx === 4) {
      for (let x = 0; x < width; x++) {
        newTerrain[x] = 650 + Math.sin(x / 150) * 150 + Math.cos(x / 60) * 60 + Math.random() * 3;
      }
    } else if (selectedTerrainIdx === 5) {
      for (let x = 0; x < width; x++) {
        const stepWidth = width / 5;
        const stepIdx = Math.floor(x / stepWidth);
        const heights = [560, 680, 780, 680, 560];
        newTerrain[x] = heights[stepIdx] + Math.random() * 2;
      }
    } else {
      const mid = width / 2;
      const mapType = Math.random() < 0.5 ? 'mountain' : 'hilly';
      if (mapType === 'mountain') {
        for (let x = 0; x < width; x++) {
          const dist = Math.abs(x - mid);
          const baseGround = 820 + Math.sin(x / 100) * 20;
          let mountainHeight = 0;
          if (dist < 650) {
            mountainHeight = 480 * Math.pow(Math.cos((dist * Math.PI) / 1300), 2);
          }
          newTerrain[x] = baseGround - mountainHeight + Math.random() * 5;
        }
      } else {
        for (let x = 0; x < width; x++) {
          newTerrain[x] = 650 + Math.sin(x / 180) * 150 + Math.cos(x / 70) * 70 + Math.random() * 4;
        }
      }
    }

    const p1Name = isMultiplayer ? (multiplayerConfig.role === 'p1' ? '나 (P1)' : '상대방 (P1)') : 'Player 1';
    const p2Name = isMultiplayer ? (multiplayerConfig.role === 'p2' ? '나 (P2)' : '상대방 (P2)') : 'Player 2';

    const newPlayers: Player[] = [
      { id: 1, name: p1Name, x: 220, y: 0, color: "#3b82f6", hp: 100, angle: 45, power: 70, moveFuel: 100, skills: 1, bullets: 20 },
      { id: 2, name: p2Name, x: width - 220, y: 0, color: "#ef4444", hp: 100, angle: 135, power: 70, moveFuel: 100, skills: 1, bullets: 20 }
    ];

    updateTankY(newPlayers[0], newTerrain);
    updateTankY(newPlayers[1], newTerrain);

    gameStateRef.current = {
      terrain: newTerrain,
      backgroundMountains: mountains,
      players: newPlayers,
      turn: 0,
      isGameOver: false,
      isFlying: false,
      isRolling: false,
      projX: 0,
      projY: 0,
      projVx: 0,
      projVy: 0,
      isSkillShot: false,
      rollTimer: 0,
      particles: [],
      shakeDuration: 0,
      shakeIntensity: 0
    };

    setTurn(0);
    setAngle(newPlayers[0].angle);
    setPower(newPlayers[0].power);
    setSkillCount(newPlayers[0].skills);
    setUseSkill(false);
    setMoveFuel(newPlayers[0].moveFuel);
    setPlayerHp([100, 100]);
    setBullets([20, 20]);
    setIsFiringState(false);
    setGameOverMsg(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMyTurn) return;
      const state = gameStateRef.current;
      if (state.isFlying || state.isGameOver || isFiringState) return;

      const p = state.players[state.turn];
      const terrain = state.terrain;
      if (!p) return;

      let moved = false;
      if (e.key === 'ArrowLeft' && p.moveFuel > 0) {
        p.x = Math.max(30, p.x - 4);
        p.moveFuel = Math.max(0, p.moveFuel - 1);
        updateTankY(p, terrain);
        moved = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' && p.moveFuel > 0) {
        p.x = Math.min(terrain.length - 30, p.x + 4);
        p.moveFuel = Math.max(0, p.moveFuel - 1);
        updateTankY(p, terrain);
        moved = true;
        e.preventDefault();
      }

      if (moved) {
        setMoveFuel(p.moveFuel);
        if (isMultiplayer) {
          const socket = getLocationSocket();
          socket.emit('game-relay', {
            roomId: activeRoomId,
            payload: {
              type: 'sync-drone-action',
              actionType: 'move',
              x: p.x,
              y: p.y,
              fuel: p.moveFuel
            }
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFiringState, isMyTurn]);

  const handleAngleChange = (newAngle: number) => {
    setAngle(newAngle);
    const state = gameStateRef.current;
    if (state.players[state.turn]) {
      state.players[state.turn].angle = newAngle;
    }
    if (isMultiplayer && isMyTurn) {
      const socket = getLocationSocket();
      socket.emit('game-relay', {
        roomId: activeRoomId,
        payload: {
          type: 'sync-drone-action',
          actionType: 'angle',
          angle: newAngle
        }
      });
    }
  };

  const handlePowerChange = (newPower: number) => {
    setPower(newPower);
    const state = gameStateRef.current;
    if (state.players[state.turn]) {
      state.players[state.turn].power = newPower;
    }
    if (isMultiplayer && isMyTurn) {
      const socket = getLocationSocket();
      socket.emit('game-relay', {
        roomId: activeRoomId,
        payload: {
          type: 'sync-drone-action',
          actionType: 'power',
          power: newPower
        }
      });
    }
  };

  const handleSkillToggle = (checked: boolean) => {
    setUseSkill(checked);
    // Sync if needed
  };

  const fire = () => {
    if (!isMyTurn) return;
    localFireAction(false);
  };

  const localFireAction = (isFromSync = false) => {
    const state = gameStateRef.current;
    if (state.isFlying || state.isGameOver || isFiringState) return;

    const p = state.players[state.turn];
    if (!p) return;

    synthRef.current?.playShoot();

    // 탄약 차감
    p.bullets = Math.max(0, p.bullets - 1);
    setBullets([state.players[0].bullets, state.players[1].bullets]);

    // Trigger checkbox skill config
    state.isSkillShot = useSkill;
    if (state.isSkillShot) {
      p.skills = Math.max(0, p.skills - 1);
      setSkillCount(p.skills);
      setUseSkill(false);
    }

    const angleRad = (p.angle * Math.PI) / 180;
    // Shoot from hovering drone height
    const bobY = Math.sin(Date.now() / 150) * 4;
    state.projX = p.x + Math.cos(angleRad) * 45;
    state.projY = (p.y - 25 + bobY) - Math.sin(angleRad) * 45;

    state.projVx = Math.cos(angleRad) * (p.power * powerMultiplier);
    state.projVy = -Math.sin(angleRad) * (p.power * powerMultiplier);

    state.isFlying = true;
    state.isRolling = false;
    state.rollTimer = 0;

    setIsFiringState(true);

    if (isMultiplayer && !isFromSync) {
      const socket = getLocationSocket();
      socket.emit('game-relay', {
        roomId: activeRoomId,
        payload: {
          type: 'sync-drone-action',
          actionType: 'fire'
        }
      });
    }
  };

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const state = gameStateRef.current;

      if (state.isFlying) {
        if (!state.isRolling) {
          state.projX += state.projVx;
          state.projY += state.projVy;
          state.projVy += 0.5; 

          if (state.projX < -150 || state.projX > canvas.width + 150 || state.projY > canvas.height + 150) {
            endTurn();
          } else {
            const enemyIdx = state.turn === 0 ? 1 : 0;
            const enemy = state.players[enemyIdx];
            // adjust Y collision for drone height
            const bobY = Math.sin(Date.now() / 150) * 4;
            if (enemy && enemy.hp > 0 && Math.hypot(state.projX - enemy.x, state.projY - (enemy.y - 35 + bobY)) < 35) {
              explode(state.projX, state.projY);
            } else {
              const tx = Math.floor(state.projX);
              if (tx >= 0 && tx < canvas.width && state.projY >= state.terrain[tx]) {
                if (state.isSkillShot) {
                  state.isRolling = true;
                  state.rollTimer = 110; 
                  state.projY = state.terrain[tx] - 6;
                  state.projVx *= 0.62;
                  state.projVy = 0;
                } else {
                  explode(state.projX, state.projY);
                }
              }
            }
          }
        } else {
          state.rollTimer--;
          const tx = Math.floor(state.projX);
          if (tx > 1 && tx < canvas.width - 2) {
            const slope = (state.terrain[tx + 1] - state.terrain[tx - 1]) / 2;
            state.projVx += slope * 0.16;
          }
          state.projVx *= 0.93; 
          state.projX += state.projVx;

          if (state.projX < 0 || state.projX >= canvas.width) {
            explode(state.projX, state.projY);
          } else {
            state.projY = state.terrain[Math.floor(state.projX)] - 6;
            const enemyIdx = state.turn === 0 ? 1 : 0;
            const enemy = state.players[enemyIdx];
            const bobY = Math.sin(Date.now() / 150) * 4;

            if (state.rollTimer <= 0 || (enemy && enemy.hp > 0 && Math.hypot(state.projX - enemy.x, state.projY - (enemy.y - 35 + bobY)) < 35)) {
              explode(state.projX, state.projY);
            }
          }
        }
      }

      state.particles = state.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; 
        p.alpha -= p.decay;
        return p.alpha > 0;
      });

      ctx.save();
      if (state.shakeDuration > 0) {
        state.shakeDuration--;
        const dx = (Math.random() - 0.5) * state.shakeIntensity;
        const dy = (Math.random() - 0.5) * state.shakeIntensity;
        ctx.translate(dx, dy);
      }

      const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      skyGrad.addColorStop(0, "#090d16"); 
      skyGrad.addColorStop(0.6, "#0f172a");
      skyGrad.addColorStop(1, "#1e1b4b");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 12345) % canvas.width;
        const sy = (i * 54321) % (canvas.height * 0.65);
        ctx.fillRect(sx, sy, 2, 2);
      }

      // Neon cyber moon
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(canvas.width - 250, 110, 42, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(129, 140, 248, 0.15)";
      ctx.beginPath();
      ctx.arc(canvas.width - 250, 110, 42, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(30, 27, 75, 0.55)";
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let i = 0; i < state.backgroundMountains.length; i++) {
        ctx.lineTo(i * 15, state.backgroundMountains[i]);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.fill();

      ctx.fillStyle = "#090d16"; 
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x < canvas.width; x++) {
        ctx.lineTo(x, state.terrain[x]);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.fill();

      ctx.lineWidth = 8;
      ctx.strokeStyle = "#38bdf8"; // Cyan cyber grass
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        ctx.lineTo(x, state.terrain[x]);
      }
      ctx.stroke();

      state.players.forEach((p, idx) => {
        if (p.hp <= 0) return;

        // Hover Bobbing Math
        const bobY = Math.sin((Date.now() + idx * 750) / 160) * 4.5;
        const droneY = p.y - 32 + bobY;

        // Draw Drone Graphics (Quadcopter)
        // 1. Arms/Frames (Left and right)
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#475569";
        ctx.beginPath();
        ctx.moveTo(p.x - 30, droneY);
        ctx.lineTo(p.x + 30, droneY);
        ctx.stroke();

        // 2. 4 spinning propellers
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#94a3b8";
        const bladeOffset = Math.sin(Date.now() / 28) * 12;

        // Left motor & propeller
        ctx.fillStyle = "#334155";
        ctx.fillRect(p.x - 28, droneY - 6, 4, 6);
        ctx.beginPath();
        ctx.moveTo(p.x - 26 - bladeOffset, droneY - 6);
        ctx.lineTo(p.x - 26 + bladeOffset, droneY - 6);
        ctx.stroke();

        // Inner Left motor & propeller
        ctx.fillRect(p.x - 14, droneY - 4, 3, 4);
        ctx.beginPath();
        ctx.moveTo(p.x - 12 - bladeOffset * 0.8, droneY - 4);
        ctx.lineTo(p.x - 12 + bladeOffset * 0.8, droneY - 4);
        ctx.stroke();

        // Right motor & propeller
        ctx.fillRect(p.x + 24, droneY - 6, 4, 6);
        ctx.beginPath();
        ctx.moveTo(p.x + 26 - bladeOffset, droneY - 6);
        ctx.lineTo(p.x + 26 + bladeOffset, droneY - 6);
        ctx.stroke();

        // Inner Right motor & propeller
        ctx.fillRect(p.x + 11, droneY - 4, 3, 4);
        ctx.beginPath();
        ctx.moveTo(p.x + 12 - bladeOffset * 0.8, droneY - 4);
        ctx.lineTo(p.x + 12 + bladeOffset * 0.8, droneY - 4);
        ctx.stroke();

        // 3. Drone central body chassis
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, droneY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Core eye/LED light
        ctx.fillStyle = "#38bdf8"; // Cyan LED core
        ctx.beginPath();
        ctx.arc(p.x, droneY, 4, 0, Math.PI * 2);
        ctx.fill();

        // 4. Barrel/Gun Turret pointing
        ctx.beginPath();
        const angleRad = (p.angle * Math.PI) / 180;
        ctx.moveTo(p.x, droneY);
        ctx.lineTo(p.x + Math.cos(angleRad) * 35, droneY - Math.sin(angleRad) * 35);
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#1e293b";
        ctx.stroke();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(p.x, droneY);
        ctx.lineTo(p.x + Math.cos(angleRad) * 30, droneY - Math.sin(angleRad) * 30);
        ctx.stroke();

        // 5. Landing gears
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#475569";
        ctx.beginPath();
        ctx.moveTo(p.x - 8, droneY + 11);
        ctx.lineTo(p.x - 12, droneY + 22);
        ctx.lineTo(p.x - 22, droneY + 22);
        ctx.moveTo(p.x + 8, droneY + 11);
        ctx.lineTo(p.x + 12, droneY + 22);
        ctx.lineTo(p.x + 22, droneY + 22);
        ctx.stroke();

        // Battle Damage smoke & fire
        if (p.hp <= 50) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
          ctx.beginPath();
          ctx.arc(p.x - 8 + Math.random() * 16, droneY - 15, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // GUI bars above drones
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(p.x - 25, droneY - 32, 50, 4);
        ctx.fillStyle = "#facc15";
        ctx.fillRect(p.x - 25, droneY - 32, 50 * (p.moveFuel / 100), 4);

        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.fillRect(p.x - 25, droneY - 25, 50, 5);
        ctx.fillStyle = "#10b981";
        ctx.fillRect(p.x - 25, droneY - 25, 50 * (p.hp / 100), 5);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11.5px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x, p.y + 18);

        if (idx === state.turn && !state.isFlying && !state.isGameOver) {
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath();
          ctx.moveTo(p.x, droneY - 45 + Math.sin(Date.now() / 150) * 3);
          ctx.lineTo(p.x - 5, droneY - 53 + Math.sin(Date.now() / 150) * 3);
          ctx.lineTo(p.x + 5, droneY - 53 + Math.sin(Date.now() / 150) * 3);
          ctx.fill();

          // Predicted trajectory guide dashes
          ctx.beginPath();
          ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
          ctx.setLineDash([4, 4]);
          let simX = p.x + Math.cos(angleRad) * 45;
          let simY = droneY - Math.sin(angleRad) * 45;
          let simVx = Math.cos(angleRad) * (p.power * powerMultiplier);
          let simVy = -Math.sin(angleRad) * (p.power * powerMultiplier);

          ctx.moveTo(simX, simY);
          const steps = p.power * 0.08;
          for (let i = 0; i < steps; i++) {
            simX += simVx;
            simY += simVy;
            simVy += 0.5;
            ctx.lineTo(simX, simY);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      if (state.isFlying) {
        ctx.fillStyle = state.isSkillShot ? "#ec4899" : "#38bdf8";
        ctx.shadowColor = state.isSkillShot ? "#f472b6" : "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(state.projX, state.projY, state.isSkillShot ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; 
      }

      state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0; 

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    const explode = (hitX: number, hitY: number) => {
      const state = gameStateRef.current;
      state.isFlying = false;
      state.isRolling = false;

      const blastRadius = state.isSkillShot ? 90 : 65;
      const maxDamage = 45;

      synthRef.current?.playExplosion();

      state.shakeDuration = 20;
      state.shakeIntensity = state.isSkillShot ? 14 : 8;

      for (let i = 0; i < 35; i++) {
        const partAngle = Math.random() * Math.PI * 2;
        const partSpeed = 2 + Math.random() * 8;
        const colorOpts = ["#38bdf8", "#0284c7", "#f43f5e", "#ffffff"];
        state.particles.push({
          x: hitX,
          y: hitY,
          vx: Math.cos(partAngle) * partSpeed,
          vy: Math.sin(partAngle) * partSpeed - 2.5,
          color: colorOpts[Math.floor(Math.random() * colorOpts.length)],
          radius: 2 + Math.random() * 4,
          alpha: 1.0,
          decay: 0.015 + Math.random() * 0.02
        });
      }

      const nextHp = [...playerHp];
      state.players.forEach((p, idx) => {
        const bobY = Math.sin((Date.now() + idx * 750) / 160) * 4.5;
        const dist = Math.hypot(hitX - p.x, hitY - (p.y - 20 + bobY));
        if (dist < blastRadius) {
          const dmg = maxDamage * (1 - dist / blastRadius);
          p.hp = Math.max(0, p.hp - Math.floor(dmg));
          nextHp[idx] = p.hp;
        }
      });
      setPlayerHp(nextHp);

      const width = state.terrain.length;
      for (let i = -blastRadius; i <= blastRadius; i++) {
        const cx = Math.floor(hitX) + i;
        if (cx >= 0 && cx < width) {
          const dy = Math.sqrt(blastRadius * blastRadius - i * i);
          if (state.terrain[cx] < hitY + dy) {
            state.terrain[cx] = Math.min(hitY + dy, canvas.height);
          }
        }
      }

      updateTankY(state.players[0], state.terrain);
      updateTankY(state.players[1], state.terrain);

      if (state.players[0].hp <= 0 || state.players[1].hp <= 0) {
        state.isGameOver = true;
        let msg = "";
        let winnerIdx: number | null = null;
        if (state.players[0].hp <= 0 && state.players[1].hp <= 0) {
          msg = "무승부! 양측 모두 격추되었습니다 🤝";
        } else if (state.players[0].hp <= 0) {
          msg = "🎉 Player 2 승리! 🎉";
          winnerIdx = 1;
        } else {
          msg = "🎉 Player 1 승리! 🎉";
          winnerIdx = 0;
        }
        setGameOverMsg(msg);
        if (winnerIdx !== null) {
          setMatchScores(prev => {
            const next = [...prev];
            next[winnerIdx!] += 1;
            return next;
          });
        }
        synthRef.current?.playVictory();
      } else if (state.players[0].bullets <= 0 && state.players[1].bullets <= 0) {
        state.isGameOver = true;
        let msg = "";
        let winnerIdx: number | null = null;
        if (state.players[0].hp === state.players[1].hp) {
          msg = "무승부! 양측 체력이 동일하고 탄약이 모두 소진되었습니다 🤝";
        } else if (state.players[0].hp < state.players[1].hp) {
          msg = `탄약 소진! 체력이 더 높은 Player 2 승리! 🏆`;
          winnerIdx = 1;
        } else {
          msg = `탄약 소진! 체력이 더 높은 Player 1 승리! 🏆`;
          winnerIdx = 0;
        }
        setGameOverMsg(msg);
        if (winnerIdx !== null) {
          setMatchScores(prev => {
            const next = [...prev];
            next[winnerIdx!] += 1;
            return next;
          });
        }
        synthRef.current?.playVictory();
      } else {
        setTimeout(endTurn, 650);
      }
    };

    const endTurn = () => {
      const state = gameStateRef.current;
      state.isFlying = false;
      state.isRolling = false;
      state.turn = state.turn === 0 ? 1 : 0;

      const nextP = state.players[state.turn];
      if (nextP) {
        nextP.moveFuel = 100;
        setTurn(state.turn);
        setAngle(nextP.angle);
        setPower(nextP.power);
        setSkillCount(nextP.skills);
        setMoveFuel(nextP.moveFuel);
      }

      setIsFiringState(false);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [turn]);

  const activePName = gameStateRef.current.players[turn]?.name || `Player ${turn + 1}`;
  const activeColor = gameStateRef.current.players[turn]?.color || "#3b82f6";

  const triggerMobileMove = (dir: 'left' | 'right') => {
    if (!isMyTurn) return;
    const state = gameStateRef.current;
    if (state.isFlying || state.isGameOver || isFiringState) return;

    const p = state.players[state.turn];
    if (!p || p.moveFuel <= 0) return;

    if (dir === 'left') {
      p.x = Math.max(30, p.x - 15);
    } else {
      p.x = Math.min(state.terrain.length - 30, p.x + 15);
    }
    p.moveFuel = Math.max(0, p.moveFuel - 4);
    updateTankY(p, state.terrain);
    setMoveFuel(p.moveFuel);

    if (isMultiplayer) {
      const socket = getLocationSocket();
      socket.emit('game-relay', {
        roomId: activeRoomId,
        payload: {
          type: 'sync-drone-action',
          actionType: 'move',
          x: p.x,
          y: p.y,
          fuel: p.moveFuel
        }
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white select-none overflow-y-auto">
      {/* Game Header */}
      <div className="bg-gradient-to-r from-slate-950 to-indigo-950 px-4 py-3 flex items-center justify-between border-b border-indigo-950 shadow-md">
        <button
          onClick={() => { onResetMultiplayer(); onBack(); }}
          className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>게임 목록</span>
        </button>
        <div className="text-right">
          <h2 className="text-xs font-black text-sky-400">드론 전쟁 (Drone Battle)</h2>
          <p className="text-[9px] text-slate-400">실시간 공중 부유 호버링 포격 대전</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-3 gap-2">
        {/* Turn indicator */}
        {!gameOverMsg ? (
          <div 
            className="text-xs font-extrabold px-4 py-1.5 rounded-full border shadow-sm uppercase animate-pulse flex items-center gap-1.5"
            style={{ 
              backgroundColor: `${activeColor}15`, 
              borderColor: activeColor,
              color: activeColor 
            }}
          >
            <span>{activePName} 턴! {isMultiplayer && (isMyTurn ? '(내 차례)' : '(상대 대기)')}</span>
            <span className="text-[9px] font-normal text-slate-400 font-mono">
              (연료: {moveFuel}%)
            </span>
          </div>
        ) : (
          <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-300 font-black px-5 py-1.5 rounded-xl text-center shadow-lg text-xs">
            <p>{gameOverMsg}</p>
            {!isMultiplayer && (
              <button 
                onClick={initGame} 
                className="mt-1 text-[10px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1 rounded-lg transition flex items-center gap-1 mx-auto"
              >
                <RotateCcw className="w-3 h-3" />
                <span>재시작</span>
              </button>
            )}
          </div>
        )}

        {/* Canvas Game Stage */}
        <div className="relative w-full max-w-[850px] aspect-[18/9.5] bg-slate-950 rounded-2xl border-2 border-slate-800 shadow-[0_0_20px_rgba(56,189,248,0.1)] overflow-hidden">
          <canvas 
            ref={canvasRef} 
            width={1800} 
            height={950}
            className="w-full h-full block bg-slate-950"
          />

          {/* 5판 승수 매치 스코어 보드 */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-full px-3 py-1 font-bold text-[9px] text-amber-400 select-none shadow-md z-10">
            🏆 5전 스코어: P1 ({matchScores[0]}승) vs P2 ({matchScores[1]}승)
          </div>

          {/* HP & 탄수 표시기 */}
          <div className="absolute top-2 left-3 flex gap-1.5 pointer-events-none select-none font-sans z-10">
            <div className="bg-blue-950/85 border border-blue-900 rounded-md px-1.5 py-0.5 text-left text-blue-200 shadow-sm">
              <p className="text-[6.5px] font-bold opacity-50">PLAYER 1</p>
              <p className="text-[8.5px] font-black leading-none">HP: {playerHp[0]}%</p>
              <p className="text-[7.5px] font-bold opacity-80 mt-0.5 leading-none">탄수: {bullets[0]}/20</p>
            </div>
            <div className="bg-red-950/85 border border-red-900 rounded-md px-1.5 py-0.5 text-left text-red-200 shadow-sm">
              <p className="text-[6.5px] font-bold opacity-50">PLAYER 2</p>
              <p className="text-[8.5px] font-black leading-none">HP: {playerHp[1]}%</p>
              <p className="text-[7.5px] font-bold opacity-80 mt-0.5 leading-none">탄수: {bullets[1]}/20</p>
            </div>
          </div>
        </div>

        {/* Compact Game Controls Panel */}
        <div className="w-full max-w-[850px] bg-slate-900/90 border border-slate-800 rounded-xl p-2 px-3.5 flex flex-wrap items-center justify-between gap-2.5 text-[11px] font-sans">
          
          {/* Mobile Movement buttons */}
          <div className="flex gap-1 shrink-0">
            <button 
              onClick={() => triggerMobileMove('left')}
              disabled={!isMyTurn || isFiringState}
              className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-950 disabled:text-slate-700 px-2 py-1.5 rounded-lg border border-slate-700 text-[10px] font-bold"
              title="왼쪽 이동"
            >
              ◀
            </button>
            <button 
              onClick={() => triggerMobileMove('right')}
              disabled={!isMyTurn || isFiringState}
              className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-950 disabled:text-slate-700 px-2 py-1.5 rounded-lg border border-slate-700 text-[10px] font-bold"
              title="오른쪽 이동"
            >
              ▶
            </button>
          </div>

          {/* Stacked Angle & Power Controls */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[150px] max-w-[280px]">
            {/* Angle Control */}
            <div className="flex items-center gap-1.5 w-full">
              <span className="text-[9px] font-bold text-slate-400 shrink-0 w-7">각도</span>
              <input 
                type="range" 
                min="0" 
                max="180" 
                value={angle} 
                disabled={!isMyTurn || isFiringState || !!gameOverMsg}
                onChange={e => handleAngleChange(parseInt(e.target.value))}
                className="flex-1 accent-sky-400 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] font-bold text-sky-400 font-mono w-7 text-right leading-none">{angle}°</span>
            </div>
            {/* Power Control */}
            <div className="flex items-center gap-1.5 w-full">
              <span className="text-[9px] font-bold text-slate-400 shrink-0 w-7">파워</span>
              <input 
                type="range" 
                min="20" 
                max="150" 
                value={power} 
                disabled={!isMyTurn || isFiringState || !!gameOverMsg}
                onChange={e => handlePowerChange(parseInt(e.target.value))}
                className="flex-1 accent-sky-400 bg-slate-800 h-1 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] font-bold text-sky-400 font-mono w-7 text-right leading-none">{power}</span>
            </div>
          </div>

          {/* Skill Selector & Terrain Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Skill Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/60 rounded-lg px-2 py-1 border border-slate-850">
              <input 
                type="checkbox" 
                id="bounceSkill"
                checked={useSkill}
                disabled={!isMyTurn || skillCount <= 0 || isFiringState || !!gameOverMsg}
                onChange={e => handleSkillToggle(e.target.checked)}
                className="w-3 h-3 rounded text-sky-600 focus:ring-sky-500 border-slate-700 bg-slate-800 cursor-pointer"
              />
              <label htmlFor="bounceSkill" className="text-[9px] font-black text-sky-400 cursor-pointer select-none leading-none">
                🎳 도탄({skillCount})
              </label>
            </div>

            {/* 5종 지형 선택기 */}
            <div className="flex items-center gap-0.5 bg-slate-950/60 rounded-lg p-1 border border-slate-850 shrink-0">
              <span className="text-[9px] font-bold text-slate-400 px-1">지형</span>
              {[
                { idx: 0, label: '랜덤' },
                { idx: 1, label: '평지' },
                { idx: 2, label: '산악' },
                { idx: 3, label: '분지' },
                { idx: 4, label: '언덕' },
                { idx: 5, label: '계단' }
              ].map(t => (
                <button
                  key={t.idx}
                  type="button"
                  onClick={() => {
                    setSelectedTerrainIdx(t.idx);
                    if (isMultiplayer) {
                      const socket = getLocationSocket();
                      socket.emit('game-relay', {
                        roomId: activeRoomId,
                        payload: {
                          type: 'sync-drone-action',
                          actionType: 'terrain',
                          terrainType: t.idx
                        }
                      });
                    }
                  }}
                  disabled={isFiringState || (isMultiplayer && multiplayerConfig.role !== 'p1')}
                  className={`text-[9.5px] font-black px-1.5 py-0.5 rounded transition ${
                    selectedTerrainIdx === t.idx
                      ? 'bg-sky-500 text-white font-extrabold shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={fire}
              disabled={!isMyTurn || isFiringState || !!gameOverMsg || bullets[myPlayerIdx] <= 0}
              className="bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-500 hover:to-indigo-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-extrabold px-3.5 py-1.5 rounded-lg text-[10px] transition shadow-lg cursor-pointer"
            >
              <span>발사!</span>
            </button>
            <button
              onClick={() => {
                setMatchScores([0, 0]);
                initGame();
              }}
              title="매치 리셋 및 새 게임"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded-lg border border-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Operating Guide footer */}
        <div className="w-full max-w-[850px] bg-slate-900/40 rounded-xl p-2.5 text-slate-400 text-[9px] leading-tight flex items-start gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <div className="text-left">
            <p>1. 내 드론 조작: 내 차례일 때 키보드 [방향키 좌/우] 또는 좌측 [◀/▶] 터치 단추를 이용해 위치를 조정할 수 있습니다.</p>
            <p>2. 드론은 공중에 부유하므로, 피격 판정이 지면보다 조금 높습니다. 프로펠러 회전 및 상하 둥둥 모션을 확인하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. CLASSIC NEON TETRIS GAME SUBCOMPONENT
// ==========================================
interface TetrisGameProps {
  onBack: () => void;
}

function TetrisGame({ onBack }: TetrisGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthRef = useRef<TetrisAudioSynth | null>(null);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const gridRef = useRef<(string | null)[][]>(
    Array(20).fill(null).map(() => Array(10).fill(null))
  );

  const currentPieceRef = useRef<{
    matrix: number[][];
    x: number;
    y: number;
    color: string;
    type: ShapeType;
  }>({
    matrix: TETRIS_SHAPES.I,
    x: 3,
    y: 0,
    color: TETRIS_COLORS.I,
    type: 'I'
  });

  const particlesRef = useRef<TetrisParticle[]>([]);
  const lastDropTimeRef = useRef<number>(0);

  useEffect(() => {
    synthRef.current = new TetrisAudioSynth();
    synthRef.current.start(isMuted);
    spawnPiece();
    
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const spawnPiece = () => {
    const keys = Object.keys(TETRIS_SHAPES) as ShapeType[];
    const randType = keys[Math.floor(Math.random() * keys.length)];
    const matrix = TETRIS_SHAPES[randType];
    const color = TETRIS_COLORS[randType];

    const newPiece = {
      matrix,
      x: Math.floor((10 - matrix[0].length) / 2),
      y: 0,
      color,
      type: randType
    };

    if (checkCollision(matrix, newPiece.x, newPiece.y)) {
      setIsGameOver(true);
      synthRef.current?.playGameOver();
      synthRef.current?.stop();
    } else {
      currentPieceRef.current = newPiece;
    }
  };

  const checkCollision = (matrix: number[][], px: number, py: number): boolean => {
    const grid = gridRef.current;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const nextX = px + c;
          const nextY = py + r;

          if (nextX < 0 || nextX >= 10 || nextY >= 20) {
            return true;
          }
          if (nextY >= 0 && grid[nextY][nextX] !== null) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const rotateMatrix = (matrix: number[][]): number[][] => {
    const n = matrix.length;
    const m = matrix[0].length;
    const rotated = Array(m).fill(null).map(() => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) {
        rotated[c][n - 1 - r] = matrix[r][c];
      }
    }
    return rotated;
  };

  const handleRotate = () => {
    if (isGameOver) return;
    const piece = currentPieceRef.current;
    const rotated = rotateMatrix(piece.matrix);
    if (!checkCollision(rotated, piece.x, piece.y)) {
      piece.matrix = rotated;
    } else if (!checkCollision(rotated, piece.x - 1, piece.y)) {
      piece.x -= 1;
      piece.matrix = rotated;
    } else if (!checkCollision(rotated, piece.x + 1, piece.y)) {
      piece.x += 1;
      piece.matrix = rotated;
    }
  };

  const handleMoveLeft = () => {
    if (isGameOver) return;
    const piece = currentPieceRef.current;
    if (!checkCollision(piece.matrix, piece.x - 1, piece.y)) {
      piece.x -= 1;
    }
  };

  const handleMoveRight = () => {
    if (isGameOver) return;
    const piece = currentPieceRef.current;
    if (!checkCollision(piece.matrix, piece.x + 1, piece.y)) {
      piece.x += 1;
    }
  };

  const handleSoftDrop = () => {
    if (isGameOver) return;
    const piece = currentPieceRef.current;
    if (!checkCollision(piece.matrix, piece.x, piece.y + 1)) {
      piece.y += 1;
      setScore(s => s + 1);
    } else {
      lockPiece();
    }
  };

  const handleHardDrop = () => {
    if (isGameOver) return;
    const piece = currentPieceRef.current;
    let dropDist = 0;
    while (!checkCollision(piece.matrix, piece.x, piece.y + 1)) {
      piece.y += 1;
      dropDist++;
    }
    setScore(s => s + dropDist * 2);
    lockPiece();
  };

  const lockPiece = () => {
    const piece = currentPieceRef.current;
    const grid = gridRef.current;

    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (piece.matrix[r][c] !== 0) {
          const boardY = piece.y + r;
          const boardX = piece.x + c;
          if (boardY >= 0 && boardY < 20 && boardX >= 0 && boardX < 10) {
            grid[boardY][boardX] = piece.color;
          }
        }
      }
    }

    clearLines();
    spawnPiece();
  };

  const clearLines = () => {
    const grid = gridRef.current;
    let linesCleared = 0;
    const canvas = canvasRef.current;

    for (let r = 20 - 1; r >= 0; r--) {
      const isFull = grid[r].every(cell => cell !== null);
      if (isFull) {
        linesCleared++;
        if (canvas) {
          const blockSize = canvas.height / 20;
          for (let col = 0; col < 10; col++) {
            const cellColor = grid[r][col] || '#00f0f0';
            const startX = col * blockSize + blockSize / 2;
            const startY = r * blockSize + blockSize / 2;
            
            for (let p = 0; p < 4; p++) {
              particlesRef.current.push({
                x: startX,
                y: startY,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 1,
                color: cellColor,
                size: 3 + Math.random() * 4,
                alpha: 1.0,
                decay: 0.02 + Math.random() * 0.03
              });
            }
          }
        }

        grid.splice(r, 1);
        grid.unshift(Array(10).fill(null));
        r++; 
      }
    }

    if (linesCleared > 0) {
      synthRef.current?.playLineClear();
      const points = [0, 100, 300, 700, 1500];
      setScore(s => s + points[linesCleared] * level);
      setLines(l => {
        const nextLines = l + linesCleared;
        const nextLevel = Math.floor(nextLines / 10) + 1;
        setLevel(nextLevel);
        return nextLines;
      });
    }
  };

  const resetGame = () => {
    gridRef.current = Array(20).fill(null).map(() => Array(10).fill(null));
    particlesRef.current = [];
    setScore(0);
    setLines(0);
    setLevel(1);
    setIsGameOver(false);
    
    if (synthRef.current) {
      synthRef.current.stop();
      synthRef.current.start(isMuted);
    }
    spawnPiece();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver) return;
      switch (e.key) {
        case 'ArrowLeft':
          handleMoveLeft();
          e.preventDefault();
          break;
        case 'ArrowRight':
          handleMoveRight();
          e.preventDefault();
          break;
        case 'ArrowUp':
          handleRotate();
          e.preventDefault();
          break;
        case 'ArrowDown':
          handleSoftDrop();
          e.preventDefault();
          break;
        case ' ':
          handleHardDrop();
          e.preventDefault();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameOver]);

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameTick = (timestamp: number) => {
      if (!lastDropTimeRef.current) lastDropTimeRef.current = timestamp;
      const dropDelay = Math.max(80, 1000 - (level - 1) * 90);
      
      if (!isGameOver) {
        const elapsed = timestamp - lastDropTimeRef.current;
        if (elapsed > dropDelay) {
          handleSoftDrop();
          lastDropTimeRef.current = timestamp;
        }
      }

      ctx.fillStyle = '#020617'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const grid = gridRef.current;
      const piece = currentPieceRef.current;
      const blockSize = canvas.height / 20;

      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= 10; c++) {
        ctx.beginPath();
        ctx.moveTo(c * blockSize, 0);
        ctx.lineTo(c * blockSize, canvas.height);
        ctx.stroke();
      }
      for (let r = 0; r <= 20; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * blockSize);
        ctx.lineTo(canvas.width, r * blockSize);
        ctx.stroke();
      }

      if (!isGameOver && piece) {
        let ghostY = piece.y;
        while (!checkCollision(piece.matrix, piece.x, ghostY + 1)) {
          ghostY++;
        }
        ctx.save();
        ctx.strokeStyle = piece.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.shadowColor = piece.color;
        ctx.shadowBlur = 4;
        
        for (let r = 0; r < piece.matrix.length; r++) {
          for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c] !== 0) {
              ctx.strokeRect(
                (piece.x + c) * blockSize + 2,
                (ghostY + r) * blockSize + 2,
                blockSize - 4,
                blockSize - 4
              );
            }
          }
        }
        ctx.restore();
      }

      for (let r = 0; r < 20; r++) {
        for (let c = 0; c < 10; c++) {
          const color = grid[r][c];
          if (color) {
            drawNeonBlock(ctx, c * blockSize, r * blockSize, blockSize, color);
          }
        }
      }

      if (!isGameOver && piece) {
        for (let r = 0; r < piece.matrix.length; r++) {
          for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c] !== 0) {
              drawNeonBlock(ctx, (piece.x + c) * blockSize, (piece.y + r) * blockSize, blockSize, piece.color, true);
            }
          }
        }
      }

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; 
        p.alpha -= p.decay;
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return p.alpha > 0;
      });

      animationFrameId = requestAnimationFrame(gameTick);
    };

    const drawNeonBlock = (context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, isActive = false) => {
      context.save();
      context.shadowColor = color;
      context.shadowBlur = isActive ? 10 : 6;
      context.fillStyle = color + '28'; 
      context.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
      context.strokeStyle = color;
      context.lineWidth = isActive ? 2.5 : 1.5;
      context.lineJoin = 'round';
      context.strokeRect(x + 2, y + 2, size - 4, size - 4);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255, 255, 255, 0.4)';
      context.fillRect(x + 4, y + 4, size - 8, 2);
      context.restore();
    };

    animationFrameId = requestAnimationFrame(gameTick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [level, isGameOver]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white select-none overflow-y-auto">
      <div className="bg-gradient-to-r from-slate-950 to-pink-950 px-4 py-3 flex items-center justify-between border-b border-pink-900 shadow-md shrink-0">
        <button
          onClick={onBack}
          className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>게임 목록</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-1.5 rounded-lg border transition ${
              isMuted ? 'border-slate-700 text-slate-500' : 'border-rose-500 text-rose-400 bg-rose-950/20'
            }`}
          >
            {isMuted ? <Music2 className="w-4 h-4" /> : <Music className="w-4 h-4" />}
          </button>
          <div className="text-right">
            <h2 className="text-xs font-black text-pink-400">네온 테트리스</h2>
            <p className="text-[9px] text-pink-300">클래식 낙하형 블록 퍼즐</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-2.5 gap-2.5">
        {/* Score Panel on Top */}
        <div className="flex flex-row gap-2 justify-center w-full max-w-[280px] font-sans">
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl px-3 py-1.5 text-center flex-1">
            <p className="text-[8px] text-slate-400 font-bold uppercase leading-none">SCORE</p>
            <p className="text-xs font-black text-rose-400 font-mono mt-0.5 leading-none">{score}</p>
          </div>
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl px-3 py-1.5 text-center flex-1">
            <p className="text-[8px] text-slate-400 font-bold uppercase leading-none">LINES</p>
            <p className="text-xs font-black text-rose-400 font-mono mt-0.5 leading-none">{lines}</p>
          </div>
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl px-3 py-1.5 text-center flex-1">
            <p className="text-[8px] text-slate-400 font-bold uppercase leading-none">LEVEL</p>
            <p className="text-xs font-black text-rose-400 font-mono mt-0.5 leading-none">{level}</p>
          </div>
        </div>

        {/* Canvas Board in Middle */}
        <div className="relative border-4 border-slate-800 bg-slate-900 rounded-2xl overflow-hidden w-[210px] h-[400px] shrink-0 shadow-lg">
          <canvas
            ref={canvasRef}
            width={300}
            height={600}
            className="w-full h-full block"
          />

          {isGameOver && (
            <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center p-4 text-center font-sans z-10">
              <p className="text-rose-500 font-black text-lg tracking-wider">GAME OVER</p>
              <p className="text-xs text-slate-400 mt-1">최종 점수: {score}점</p>
              <button
                onClick={resetGame}
                className="mt-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                다시 시작
              </button>
            </div>
          )}
        </div>

        {/* Control Pad at Bottom */}
        <div className="w-full max-w-[280px] flex flex-col gap-2 font-sans shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleMoveLeft}
              className="bg-slate-900 hover:bg-slate-800 active:bg-rose-950 border border-slate-700 rounded-xl py-2.5 flex items-center justify-center text-lg cursor-pointer"
            >
              ←
            </button>
            <button
              onClick={handleRotate}
              className="bg-slate-900 hover:bg-slate-800 active:bg-rose-950 border border-slate-700 rounded-xl py-2.5 flex items-center justify-center text-lg cursor-pointer"
            >
              ↻
            </button>
            <button
              onClick={handleMoveRight}
              className="bg-slate-900 hover:bg-slate-800 active:bg-rose-950 border border-slate-700 rounded-xl py-2.5 flex items-center justify-center text-lg cursor-pointer"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSoftDrop}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl py-2 flex flex-col items-center cursor-pointer"
            >
              <span className="text-xs">↓</span>
            </button>
            <button
              onClick={handleHardDrop}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl py-2 flex flex-col items-center cursor-pointer"
            >
              <span className="text-xs">⇓</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. YUT NORI (윷놀이) GAME SUBCOMPONENT
// ==========================================
interface YutNoriGameProps {
  onBack: () => void;
  friends: any[];
  activeProfileId: string;
  activeRoomId: string;
  multiplayerConfig: { game: 'drone_battle' | 'yut_nori'; opponentId: string; role: 'p1' | 'p2' } | null;
  onResetMultiplayer: () => void;
}

const YUT_STATIONS = [
  { id: 0, x: 260, y: 260, name: '날날이(출발/대기)' },
  { id: 1, x: 260, y: 210 },
  { id: 2, x: 260, y: 160 },
  { id: 3, x: 260, y: 110 },
  { id: 4, x: 260, y: 60 },
  { id: 5, x: 260, y: 10, corner: 'top-right' },
  { id: 6, x: 210, y: 10 },
  { id: 7, x: 160, y: 10 },
  { id: 8, x: 110, y: 10 },
  { id: 9, x: 60, y: 10 },
  { id: 10, x: 10, y: 10, corner: 'top-left' },
  { id: 11, x: 10, y: 60 },
  { id: 12, x: 10, y: 110 },
  { id: 13, x: 10, y: 160 },
  { id: 14, x: 10, y: 210 },
  { id: 15, x: 10, y: 260, corner: 'bottom-left' },
  { id: 16, x: 60, y: 260 },
  { id: 17, x: 110, y: 260 },
  { id: 18, x: 160, y: 260 },
  { id: 19, x: 210, y: 260 },
  { id: 20, x: 210, y: 60 },
  { id: 21, x: 175, y: 95 },
  { id: 22, x: 135, y: 135, corner: 'center' },
  { id: 23, x: 95, y: 175 },
  { id: 24, x: 60, y: 210 },
  { id: 25, x: 60, y: 60 },
  { id: 26, x: 95, y: 95 },
  { id: 27, x: 175, y: 175 },
  { id: 28, x: 210, y: 210 }
];

interface Mal {
  id: number;
  player: 1 | 2;
  stationId: number | null; 
  isFinished: boolean;
  groupWith: number[]; 
}

function YutNoriGame({ 
  onBack, 
  friends, 
  activeProfileId, 
  activeRoomId, 
  multiplayerConfig, 
  onResetMultiplayer 
}: YutNoriGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthRef = useRef<AudioSynth | null>(null);

  const [yutTurn, setYutTurn] = useState<1 | 2>(1); 
  const [thrownResult, setThrownResult] = useState<string | null>(null);
  const [thrownSteps, setThrownSteps] = useState<number>(0);
  const [canThrow, setCanThrow] = useState(true);
  const [selectedMalIdx, setSelectedMalIdx] = useState<number | null>(null);
  const [yutWinner, setYutWinner] = useState<1 | 2 | null>(null);

  const [mals, setMals] = useState<Mal[]>([
    { id: 0, player: 1, stationId: null, isFinished: false, groupWith: [] },
    { id: 1, player: 1, stationId: null, isFinished: false, groupWith: [] },
    { id: 2, player: 1, stationId: null, isFinished: false, groupWith: [] },
    { id: 3, player: 1, stationId: null, isFinished: false, groupWith: [] },
    { id: 4, player: 2, stationId: null, isFinished: false, groupWith: [] },
    { id: 5, player: 2, stationId: null, isFinished: false, groupWith: [] },
    { id: 6, player: 2, stationId: null, isFinished: false, groupWith: [] },
    { id: 7, player: 2, stationId: null, isFinished: false, groupWith: [] }
  ]);

  const [sticks, setSticks] = useState<Array<{ x: number; y: number; rot: number; scale: number; val: 0 | 1 }>>([
    { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
    { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
    { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
    { x: 0, y: 150, rot: 0, scale: 1, val: 0 }
  ]);
  const [isThrowingAnimation, setIsThrowingAnimation] = useState(false);

  const isMultiplayer = !!multiplayerConfig;
  const myPlayerNum = isMultiplayer ? (multiplayerConfig.role === 'p1' ? 1 : 2) : 1;
  const isMyTurn = !yutWinner && (!isMultiplayer || yutTurn === myPlayerNum);

  const resetGame = () => {
    setYutTurn(1);
    setThrownResult(null);
    setThrownSteps(0);
    setCanThrow(true);
    setSelectedMalIdx(null);
    setYutWinner(null);
    setMals([
      { id: 0, player: 1, stationId: null, isFinished: false, groupWith: [] },
      { id: 1, player: 1, stationId: null, isFinished: false, groupWith: [] },
      { id: 2, player: 1, stationId: null, isFinished: false, groupWith: [] },
      { id: 3, player: 1, stationId: null, isFinished: false, groupWith: [] },
      { id: 4, player: 2, stationId: null, isFinished: false, groupWith: [] },
      { id: 5, player: 2, stationId: null, isFinished: false, groupWith: [] },
      { id: 6, player: 2, stationId: null, isFinished: false, groupWith: [] },
      { id: 7, player: 2, stationId: null, isFinished: false, groupWith: [] }
    ]);
    setSticks([
      { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
      { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
      { x: 0, y: 150, rot: 0, scale: 1, val: 0 },
      { x: 0, y: 150, rot: 0, scale: 1, val: 0 }
    ]);
  };

  useEffect(() => {
    synthRef.current = new AudioSynth();
    
    const socket = getLocationSocket();
    const handleYutSync = (payload: any) => {
      if (!isMultiplayer) return;
      if (payload.type === 'sync-yut-action') {
        if (payload.actionType === 'throw') {
          localThrowAction(payload.yuts, true);
        } else if (payload.actionType === 'move') {
          localMoveAction(payload.malIdx, payload.steps, true);
        }
      }
    };
    socket.on('game-relayed', handleYutSync);
    return () => {
      socket.off('game-relayed', handleYutSync);
    };
  }, [multiplayerConfig, yutTurn, canThrow, mals, sticks, isThrowingAnimation, thrownSteps]);

  const getStationCenter = (st: { x: number; y: number }) => {
    const ox = st.x + 10;
    const oy = st.y + 10;
    const cx = 250 + (ox - 145) * 1.2;
    const cy = 190 + (oy - 145) * 1.2;
    return { x: cx, y: cy };
  };

  const drawMalCircle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, mal: Mal, idx: number, isSelected: boolean) => {
    if (isSelected) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#eab308';
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = mal.player === 1 ? '#3b82f6' : '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const carryCount = mal.groupWith.length;
    ctx.fillText(carryCount > 0 ? `${mal.id % 4 + 1}(+${carryCount})` : `${mal.id % 4 + 1}`, cx, cy);
  };

  const drawFinishedMal = (ctx: CanvasRenderingContext2D, cx: number, cy: number, mal: Mal) => {
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = mal.player === 1 ? '#3b82f6' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🏁${mal.id % 4 + 1}`, cx, cy);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tl = getStationCenter({ x: 10, y: 10 });
    const tr = getStationCenter({ x: 260, y: 10 });
    const bl = getStationCenter({ x: 10, y: 260 });
    const br = getStationCenter({ x: 260, y: 260 });

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#818cf8';
    ctx.strokeStyle = '#312e81';
    ctx.lineWidth = 4;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(br.x, br.y);
    ctx.moveTo(tr.x, tr.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    YUT_STATIONS.forEach(st => {
      const coords = getStationCenter(st);
      ctx.fillStyle = st.corner ? '#ec4899' : '#1e1b4b';
      ctx.strokeStyle = st.corner ? '#f472b6' : '#6366f1';
      ctx.lineWidth = st.corner ? 3.5 : 2;
      ctx.shadowColor = st.corner ? '#ec4899' : '#6366f1';
      ctx.shadowBlur = st.corner ? 8 : 4;
      ctx.beginPath();
      ctx.arc(coords.x, coords.y, st.corner ? 12 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 출발지 텍스트 표시
      if (st.id === 0) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('출발', coords.x, coords.y + 18);
      }
    });

    // Resolve Player Names
    const p1Profile = isMultiplayer
      ? (multiplayerConfig.role === 'p1' ? friends.find(f => f.id === activeProfileId) : friends.find(f => f.id === multiplayerConfig.opponentId))
      : friends.find(f => f.id === activeProfileId);
    const p2Profile = isMultiplayer
      ? (multiplayerConfig.role === 'p2' ? friends.find(f => f.id === activeProfileId) : friends.find(f => f.id === multiplayerConfig.opponentId))
      : friends.find(f => f.id !== activeProfileId);

    const p1Name = p1Profile ? (p1Profile.alias || p1Profile.realName || p1Profile.name).split(' ')[0] : 'Player 1';
    const p2Name = p2Profile ? (p2Profile.alias || p2Profile.realName || p2Profile.name).split(' ')[0] : 'Player 2';

    // Player 1 (Left Side, X: 50)
    ctx.fillStyle = yutTurn === 1 ? '#3b82f6' : '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p1Name, 50, 35);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('플레이어 1', 50, 50);

    if (yutTurn === 1 && !yutWinner) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(50, 42, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Player 2 (Right Side, X: 450)
    ctx.fillStyle = yutTurn === 2 ? '#ef4444' : '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(p2Name, 450, 35);
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('플레이어 2', 450, 50);

    if (yutTurn === 2 && !yutWinner) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(450, 42, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Headers
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('대기', 50, 80);
    ctx.fillText('완료', 50, 220);
    ctx.fillText('대기', 450, 80);
    ctx.fillText('완료', 450, 220);

    let p1WaitCount = 0;
    let p1DoneCount = 0;
    let p2WaitCount = 0;
    let p2DoneCount = 0;

    mals.forEach((mal, idx) => {
      const isSelected = selectedMalIdx === idx;
      if (mal.player === 1) {
        if (mal.stationId === null && !mal.isFinished) {
          const cx = 50;
          const cy = 100 + p1WaitCount * 26;
          drawMalCircle(ctx, cx, cy, mal, idx, isSelected);
          p1WaitCount++;
        } else if (mal.isFinished) {
          const cx = 50;
          const cy = 240 + p1DoneCount * 26;
          drawFinishedMal(ctx, cx, cy, mal);
          p1DoneCount++;
        }
      } else {
        if (mal.stationId === null && !mal.isFinished) {
          const cx = 450;
          const cy = 100 + p2WaitCount * 26;
          drawMalCircle(ctx, cx, cy, mal, idx, isSelected);
          p2WaitCount++;
        } else if (mal.isFinished) {
          const cx = 450;
          const cy = 240 + p2DoneCount * 26;
          drawFinishedMal(ctx, cx, cy, mal);
          p2DoneCount++;
        }
      }
    });

    mals.forEach((mal, idx) => {
      if (mal.isFinished || mal.stationId === null) return;
      const st = YUT_STATIONS.find(s => s.id === mal.stationId);
      if (st) {
        const coords = getStationCenter(st);
        const isSelected = selectedMalIdx === idx;
        drawMalCircle(ctx, coords.x, coords.y, mal, idx, isSelected);
      }
    });
  }, [mals, selectedMalIdx, friends, yutTurn, yutWinner]);

  const throwYut = () => {
    if (!isMyTurn || !canThrow) return;
    const newYuts = [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1];
    if (isMultiplayer) {
      const socket = getLocationSocket();
      socket.emit('game-relay', { roomId: activeRoomId, payload: { type: 'sync-yut-action', actionType: 'throw', yuts: newYuts } });
    }
    localThrowAction(newYuts, false);
  };

  const localThrowAction = (yuts: number[], isFromSync = false) => {
    setIsThrowingAnimation(true);
    setCanThrow(false);
    synthRef.current?.playYutThrow();
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setSticks(prev => prev.map((s, idx) => {
        const sway = idx % 2 === 0 ? 1 : -1;
        let xOffset = 0;
        let yOffset = 160;
        let rotVal = s.rot + 0.85;
        let scaleVal = 1.0;
        
        if (frame < 15) {
          xOffset = Math.sin(frame * 0.5 + idx * 1.2) * 60 * sway;
          yOffset = 160 - frame * 18;
          scaleVal = 1.0 + frame * 0.08;
        } else if (frame < 26) {
          xOffset = Math.sin(frame * 0.5 + idx * 1.2) * 60 * sway;
          yOffset = -110 + (frame - 15) * 25;
          scaleVal = 2.2 - (frame - 15) * 0.11;
        } else {
          if (frame === 26) synthRef.current?.playYutWoodSound();
          xOffset = Math.sin(idx * 1.5) * 8;
          yOffset = 165 + (frame % 2 === 0 ? 3 : -3);
          rotVal = Math.round(s.rot / Math.PI) * Math.PI;
          scaleVal = 1.0;
        }
        
        return {
          x: xOffset,
          y: yOffset,
          rot: rotVal,
          scale: scaleVal,
          val: frame >= 26 ? (yuts[idx] as (0 | 1)) : 0
        };
      }));
      
      if (frame >= 30) {
        clearInterval(interval);
        setIsThrowingAnimation(false);
        const roundCount = yuts.filter(v => v === 0).length;
        let label = '돼지';
        let steps = 1;
        if (roundCount === 1) {
          if (yuts[0] === 0) {
            label = '빽도';
            steps = -1;
          } else {
            label = '돼지 (도)';
            steps = 1;
          }
        } else if (roundCount === 2) {
          label = '개 (개)';
          steps = 2;
        } else if (roundCount === 3) {
          label = '양 (걸)';
          steps = 3;
        } else if (roundCount === 4) {
          label = '소 (윷)';
          steps = 4;
        } else if (roundCount === 0) {
          label = '말 (모)';
          steps = 5;
        }
        setThrownResult(label);
        setThrownSteps(steps);
      }
    }, 40);
  };

  const getNextStation = (curr: number | null, steps: number) => {
    if (steps === -1) {
      if (curr === null) return { next: null, isGoal: false };
      if (curr === 1) return { next: 0, isGoal: false };
      if (curr === 20) return { next: 5, isGoal: false };
      if (curr === 25) return { next: 10, isGoal: false };
      if (curr === 22) return { next: 21, isGoal: false };
      return { next: curr - 1 < 0 ? 19 : curr - 1, isGoal: false };
    }
    let c = curr === null ? 0 : curr;
    for (let i = 0; i < steps; i++) {
      if (c === 5) c = 20; else if (c === 10) c = 25; else if (c === 22) c = 23; else if (c === 24) c = 15; else if (c === 28) return { next: 0, isGoal: true };
      else c = (c + 1) % 20;
    }
    return { next: c === 0 ? 0 : c, isGoal: c === 0 };
  };

  const moveMal = (malIdx: number) => {
    if (!isMyTurn || canThrow || isThrowingAnimation || thrownSteps === 0) return;
    if (isMultiplayer) {
      const socket = getLocationSocket();
      socket.emit('game-relay', { roomId: activeRoomId, payload: { type: 'sync-yut-action', actionType: 'move', malIdx, steps: thrownSteps } });
    }
    localMoveAction(malIdx, thrownSteps, false);
  };

  const localMoveAction = (malIdx: number, steps: number, isFromSync = false) => {
    const nextMals = [...mals];
    const targetMal = nextMals[malIdx];
    const groupIndices = [malIdx, ...targetMal.groupWith];
    const { next: nextStation, isGoal } = getNextStation(targetMal.stationId, steps);
    groupIndices.forEach(idx => {
      const m = nextMals[idx];
      m.isFinished = isGoal;
      m.stationId = isGoal ? 0 : nextStation;
    });
    let extraThrow = steps === 4 || steps === 5;
    if (!isGoal && nextStation !== null && nextStation !== 0) {
      const enemy = nextMals.filter(m => !m.isFinished && m.player !== yutTurn && m.stationId === nextStation);
      if (enemy.length > 0) {
        extraThrow = true;
        synthRef.current?.playExplosion();
        enemy.forEach(m => { m.stationId = null; m.groupWith = []; });
      } else {
        const own = nextMals.filter(m => !m.isFinished && m.player === yutTurn && m.stationId === nextStation && !groupIndices.includes(m.id));
        if (own.length > 0) {
          const host = own[0];
          groupIndices.forEach(idx => { if (idx !== host.id && !host.groupWith.includes(idx)) host.groupWith.push(idx); });
          groupIndices.forEach(idx => { if (idx !== host.id) nextMals[idx].groupWith = []; });
        }
      }
    }
    setMals(nextMals);
    setSelectedMalIdx(null);
    setThrownResult(null);
    setThrownSteps(0);
    if (nextMals.filter(m => m.player === yutTurn).every(m => m.isFinished)) { setYutWinner(yutTurn); synthRef.current?.playVictory(); return; }
    if (!extraThrow) { setYutTurn(prev => prev === 1 ? 2 : 1); }
    setCanThrow(true);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white select-none overflow-y-auto">
      <div className="bg-gradient-to-r from-slate-950 to-indigo-950 px-4 py-3 flex items-center justify-between border-b border-indigo-950 shadow-md shrink-0">
        <button
          onClick={() => { onResetMultiplayer(); onBack(); }}
          className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>게임 목록</span>
        </button>
        <div className="text-right">
          <h2 className="text-xs font-black text-amber-400">전통 윷놀이 (Yut Nori)</h2>
          <p className="text-[9px] text-slate-400">동네 안심 윷 던지기 퍼즐</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-2 gap-2">
        {!yutWinner ? (
          <div className="flex items-center gap-3">
            <div 
              className="text-[10px] font-extrabold px-3 py-1 rounded-full border shadow-sm uppercase animate-pulse flex items-center gap-1"
              style={{ backgroundColor: yutTurn === 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)', borderColor: yutTurn === 1 ? '#3b82f6' : '#ef4444', color: yutTurn === 1 ? '#60a5fa' : '#f87171' }}
            >
              <span>{yutTurn === 1 ? 'Player 1' : 'Player 2'} 차례! {isMultiplayer && (isMyTurn ? '(내 차례)' : '(대기)')}</span>
            </div>
            {thrownResult && (
              <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full animate-bounce">결과: {thrownResult}</span>
            )}
          </div>
        ) : (
          <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-300 font-black px-6 py-2 rounded-xl text-center shadow-lg text-xs">
            <p>🏆 Player {yutWinner} 승리! 🏆</p>
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-2.5 items-center justify-center w-full max-w-[850px] shrink-0">
          <div className="relative border-4 border-slate-800 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl w-[320px] h-[245px] sm:w-[400px] sm:h-[300px] md:w-[500px] md:h-[380px] shrink-0">
            <canvas ref={canvasRef} width={500} height={380} className="w-full h-full block" />
          </div>
          <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 w-full max-w-[190px] shrink-0 gap-2">
            <p className="text-[9px] font-bold text-slate-400">윷가락 던지기 상태</p>
            <div className="flex gap-2 h-[80px] items-center justify-center">
              {sticks.map((stick, idx) => (
                <div 
                  key={idx}
                  style={{ transform: `translate(${stick.x}px, ${stick.y - 150}px) rotate(${stick.rot}rad) scale(${stick.scale})`, transition: 'transform 0.05s linear' }}
                  className="w-4 h-16 bg-amber-100 rounded-md border border-amber-900 relative shadow-md flex items-center justify-center overflow-hidden"
                >
                  {stick.val === 1 ? (
                    <div className="absolute inset-0 bg-white flex flex-col justify-around py-1.5">
                      {idx === 0 && <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-red-600"></span>}
                      <span className="text-[7px] text-red-500 font-extrabold leading-none">✕</span>
                      <span className="text-[7px] text-red-500 font-extrabold leading-none">✕</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-800 to-amber-950">
                      {idx === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-950/20">
                          <span className="text-[8px] text-red-400 font-black">뒤</span>
                        </div>
                      ) : (
                        <div className="w-0.5 h-full bg-amber-900 mx-auto" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={throwYut}
              disabled={!isMyTurn || !canThrow || isThrowingAnimation}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-black py-2 rounded-xl text-[10px] transition shadow-lg cursor-pointer"
            >
              {isThrowingAnimation ? '흔드는 중...' : '윷 던지기!'}
            </button>

            {/* 말 간편 선택 버튼 그룹 */}
            {!yutWinner && thrownSteps !== 0 && isMyTurn && (
              <div className="w-full flex flex-col gap-1.5 mt-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                <p className="text-[9px] font-black text-slate-400 text-center">움직일 말 선택 ({yutTurn === 1 ? 'P1' : 'P2'})</p>
                <div className="grid grid-cols-4 gap-1">
                  {mals
                    .filter(m => m.player === yutTurn)
                    .map(m => {
                      const label = m.isFinished 
                        ? '🏁' 
                        : m.stationId === null 
                          ? '대기' 
                          : `${m.stationId}번`;
                      const isSelected = selectedMalIdx === m.id;
                      
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMalIdx(m.id)}
                          disabled={m.isFinished}
                          className={`text-[9.5px] font-black py-1.5 px-0.5 rounded border transition flex flex-col items-center gap-0.5 cursor-pointer ${
                            isSelected
                              ? 'bg-sky-500 text-white border-sky-400'
                              : 'bg-slate-800 text-slate-350 border-slate-700 hover:bg-slate-700'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          <span className="text-[8px] font-bold opacity-60">말 {m.id % 4 + 1}</span>
                          <span className="truncate max-w-full font-sans">{label}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {!yutWinner && thrownSteps !== 0 && isMyTurn && selectedMalIdx !== null && (
              <button
                onClick={() => moveMal(selectedMalIdx)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl text-xs transition mt-2 cursor-pointer animate-pulse border border-black"
              >
                선택한 말 이동하기 ({thrownSteps > 0 ? `+${thrownSteps}` : `${thrownSteps}`})
              </button>
            )}
          </div>
        </div>

        {/* Operating Guide footer */}
        <div className="w-full max-w-[500px] bg-slate-900/40 rounded-xl p-2.5 text-slate-400 text-[9px] leading-tight flex items-start gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-left">
            <p>1. 내 차례에 <b>[윷 던지기]</b>를 누르면 윷가락이 튕겨 오릅니다. 윷/모가 나오면 한 번 더 던질 수 있습니다.</p>
            <p>2. 말을 움직일 때 상대방 말을 잡으면 던지기 기회를 1회 더 얻으며, 같은 칸의 내 말은 함께 업고 갑니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. MAIN GAMEPANEL ENTRY WITH MULTIPLAYER LOBBY
// ==========================================
interface GamePanelProps {
  friends: any[];
  activeProfileId: string;
  activeRoomId: string;
  multiplayerConfig: { game: 'drone_battle' | 'yut_nori'; opponentId: string; role: 'p1' | 'p2' } | null;
  onResetMultiplayer: () => void;
}

const TETRIS_SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1]
  ]
};

const TETRIS_COLORS = {
  I: '#00f0f0',
  O: '#fbfb04',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000'
};

type ShapeType = keyof typeof TETRIS_SHAPES;

export default function GamePanel({ 
  friends, 
  activeProfileId, 
  activeRoomId, 
  multiplayerConfig, 
  onResetMultiplayer 
}: GamePanelProps) {
  const [activeGame, setActiveGame] = useState<'drone_battle' | 'tetris' | 'yut_nori' | null>(null);

  // Transition to multiplayer game automatically if matched globally
  useEffect(() => {
    if (multiplayerConfig) {
      setActiveGame(multiplayerConfig.game);
    }
  }, [multiplayerConfig]);

  const sendGameInvite = async (friendId: string, gameType: 'drone_battle' | 'yut_nori') => {
    const socket = getLocationSocket();
    socket.emit('game-relay', {
      roomId: activeRoomId,
      payload: {
        type: 'invite',
        from: activeProfileId,
        to: friendId,
        game: gameType
      }
    });
    
    // REST API call to persist the invitation and alert in notifications
    try {
      await fetch('/api/games/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('aemang_token') || ''}`
        },
        body: JSON.stringify({
          from: activeProfileId,
          to: friendId,
          game: gameType,
          roomId: activeRoomId
        })
      });
    } catch (err) {
      console.warn('Game invite REST error (falling back to socket-only):', err);
    }
    
    alert('게임 대결 신청이 발송되었습니다. 상대방이 알림창이나 팝업에서 수락하면 바로 대국이 연동됩니다! 🎮');
  };

  if (activeGame === null) {
    // Show Selection Cards and Online Room Friends list to invite
    const onlineFriends = friends.filter(f => f.id !== activeProfileId && !f.isPendingInvite);

    return (
      <div className="flex flex-col h-full bg-slate-950 text-white select-none p-5 space-y-5 overflow-y-auto font-sans">
        <div className="text-center pt-3 pb-1">
          <Gamepad2 className="w-10 h-10 text-rose-500 mx-auto animate-bounce" />
          <h2 className="text-base font-black mt-2.5 text-slate-100">애플망고 안심 게임방 (beta)</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">심심할 때 즐기는 미니 게임 리스트</p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 pt-1">
          {/* Card 1: Drone Battle */}
          <div className="relative bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 hover:border-indigo-500 rounded-2xl p-4 text-left transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(99,102,241,0.15)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-2xl">🛸</span>
                <span className="bg-indigo-500/20 text-indigo-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">드론 포격전</span>
              </div>
              <h3 className="text-sm font-black mt-2.5 text-white">드론 전쟁 (Drone Battle)</h3>
              <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">각도를 맞추고 파워를 조정하여 상대 드론을 격추하는 포격전! 프로펠러 회전 및 상하 둥둥 부유 호버링 물리 탑재.</p>
            </div>
            <button
              onClick={() => setActiveGame('drone_battle')}
              className="mt-3 w-full bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black py-2 rounded-xl transition cursor-pointer"
            >
              혼자서 대결 연습하기
            </button>
          </div>

          {/* Card 2: Yut Nori */}
          <div className="relative bg-gradient-to-br from-amber-950/60 to-orange-950/60 border border-amber-500/30 hover:border-amber-500 rounded-2xl p-4 text-left transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(245,158,11,0.15)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-2xl">🎲</span>
                <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">전통 보드게임</span>
              </div>
              <h3 className="text-sm font-black mt-2.5 text-white">전통 윷놀이 (Yut Nori)</h3>
              <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">윷가락을 던져 튕겨오르는 역동적인 바운스 물리 탑재! 국악 풍의 신나는 신스 멜로디 및 말판 규칙(잡기/업기) 완벽 연동.</p>
            </div>
            <button
              onClick={() => setActiveGame('yut_nori')}
              className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black py-2 rounded-xl transition cursor-pointer"
            >
              혼자서 대결 연습하기
            </button>
          </div>

          {/* Card 3: Tetris */}
          <div className="relative bg-gradient-to-br from-pink-950/60 to-rose-950/60 border border-pink-500/30 hover:border-pink-500 rounded-2xl p-4 text-left transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(236,72,153,0.15)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <span className="text-2xl">🧱</span>
                <span className="bg-pink-500/20 text-pink-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">클래식 퍼즐</span>
              </div>
              <h3 className="text-sm font-black mt-2.5 text-white">네온 테트리스 (Neon Tetris)</h3>
              <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">형형색색의 네온 블록과 환상적인 레트로 사운드가 함께하는 안심 테트리스! 모바일 가로/세로 조작기 탑재.</p>
            </div>
            <button
              onClick={() => setActiveGame('tetris')}
              className="mt-3 w-full bg-pink-500 hover:bg-pink-600 text-white text-[10px] font-black py-2 rounded-xl transition cursor-pointer"
            >
              테트리스 혼자 하기
            </button>
          </div>
        </div>

        {/* Room multiplayer invite lobby */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 mt-2">
          <h3 className="text-xs font-black text-rose-400 flex items-center gap-1">
            <span>👥</span>
            <span>대화방 친구와 1:1 대결하기</span>
          </h3>
          <p className="text-[9.5px] text-slate-400 leading-tight">
            현재 같은 모임 대화방에 들어와 있는 온라인 친구에게 초대를 보낼 수 있습니다.
          </p>

          <div className="space-y-1.5 pt-2 max-h-[140px] overflow-y-auto">
            {onlineFriends.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic text-center py-2">
                초대 가능한 다른 온라인 친구가 없습니다.
              </p>
            ) : (
              onlineFriends.map(f => (
                <div key={f.id} className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-850">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{f.avatar || '👤'}</span>
                    <div>
                      <p className="text-xs font-bold text-white">{f.alias || f.name}</p>
                      <p className="text-[8.5px] text-emerald-400 font-bold">● 접속중</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => sendGameInvite(f.id, 'drone_battle')}
                      className="bg-indigo-650 hover:bg-indigo-700 text-white text-[9px] font-black px-2 py-1 rounded-lg transition cursor-pointer"
                    >
                      🛸 드론초대
                    </button>
                    <button
                      onClick={() => sendGameInvite(f.id, 'yut_nori')}
                      className="bg-amber-600 hover:bg-amber-700 text-slate-950 text-[9px] font-black px-2 py-1 rounded-lg transition cursor-pointer"
                    >
                      🎲 윷놀이초대
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeGame === 'drone_battle') {
    return (
      <DroneCrashGame 
        onBack={() => setActiveGame(null)} 
        friends={friends} 
        activeProfileId={activeProfileId}
        activeRoomId={activeRoomId}
        multiplayerConfig={multiplayerConfig}
        onResetMultiplayer={onResetMultiplayer}
      />
    );
  }

  if (activeGame === 'yut_nori') {
    return (
      <YutNoriGame
        onBack={() => setActiveGame(null)} 
        friends={friends} 
        activeProfileId={activeProfileId}
        activeRoomId={activeRoomId}
        multiplayerConfig={multiplayerConfig}
        onResetMultiplayer={onResetMultiplayer}
      />
    );
  }

  return <TetrisGame onBack={() => setActiveGame(null)} />;
}
