import { Friend, Message, Appointment } from '../types';

/**
 * Type validation tests
 */
describe('Type Definitions', () => {
  it('should create a valid Friend object', () => {
    const friend: Friend = {
      id: 'friend-1',
      name: 'Test Friend',
      avatar: '👨',
      color: '#FF5733',
      lat: 37.5565,
      lng: 126.9242,
      statusMsg: 'Happy testing',
      isOnline: true,
      battery: 85,
      speed: 5,
      heading: '북쪽',
      route: [[37.5565, 126.9242]],
      routeIndex: 0,
      updatedAt: new Date().toISOString(),
    };

    expect(friend.id).toBe('friend-1');
    expect(friend.lat).toBeGreaterThanOrEqual(-90);
    expect(friend.lat).toBeLessThanOrEqual(90);
    expect(friend.lng).toBeGreaterThanOrEqual(-180);
    expect(friend.lng).toBeLessThanOrEqual(180);
    expect(friend.battery).toBeGreaterThanOrEqual(0);
    expect(friend.battery).toBeLessThanOrEqual(100);
  });

  it('should create a valid Message object', () => {
    const message: Message = {
      id: 'msg-1',
      senderId: 'user-minsu',
      senderName: '민수',
      senderAvatar: '🟢',
      senderColor: '#3B82F6',
      text: '테스트 메시지',
      timestamp: new Date().toISOString(),
    };

    expect(message.text).toBeTruthy();
    expect(message.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should create a valid Appointment object', () => {
    const appointment: Appointment = {
      id: 'app-1',
      title: '테스트 약속',
      placeName: 'Test Place',
      lat: 37.5565,
      lng: 126.9242,
      datetime: '2026-06-03 15:00',
      creatorName: '민수',
      attendees: ['민수', '지우'],
      votes: {
        'user-minsu': 'yes',
        'friend-jiwoo': 'maybe',
      },
    };

    expect(appointment.title).toBe('테스트 약속');
    expect(appointment.attendees.length).toBeGreaterThan(0);
  });
});

/**
 * Location validation tests
 */
describe('Location Validation', () => {
  const isValidCoordinates = (lat: number, lng: number): boolean => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };

  it('should validate correct coordinates', () => {
    expect(isValidCoordinates(37.5565, 126.9242)).toBe(true);
    expect(isValidCoordinates(0, 0)).toBe(true);
    expect(isValidCoordinates(-12.5, 90.5)).toBe(true);
  });

  it('should reject invalid coordinates', () => {
    expect(isValidCoordinates(100, 126.9242)).toBe(false);
    expect(isValidCoordinates(37.5565, 200)).toBe(false);
    expect(isValidCoordinates(-100, -200)).toBe(false);
  });
});

/**
 * Phone number validation tests
 */
describe('Phone Number Validation', () => {
  const isValidKoreanPhone = (phone: string): boolean => {
    const phoneRegex = /^\d{2,3}-\d{3,4}-\d{4}$/;
    return phoneRegex.test(phone);
  };

  it('should validate correct phone numbers', () => {
    expect(isValidKoreanPhone('010-1234-5678')).toBe(true);
    expect(isValidKoreanPhone('02-123-4567')).toBe(true);
    expect(isValidKoreanPhone('031-1234-5678')).toBe(true);
    expect(isValidKoreanPhone('031-12345-6789')).toBe(false);
  });

  it('should reject invalid phone numbers', () => {
    expect(isValidKoreanPhone('01012345678')).toBe(false);
    expect(isValidKoreanPhone('010-1234')).toBe(false);
    expect(isValidKoreanPhone('not-a-phone')).toBe(false);
  });
});
