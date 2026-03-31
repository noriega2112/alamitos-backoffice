import React from 'react';
import { Modal } from 'react-bootstrap';

const TIMEZONE = 'America/Tegucigalpa';

function getTodayDow() {
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(new Date());
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[dayStr] ?? 0;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

const TODAY_DOW = getTodayDow();

const ClosedModal = ({ show, schedule = [] }) => {
  return (
    <Modal show={show} centered backdrop="static" keyboard={false}>
      <Modal.Header className="border-0 pb-0">
        <Modal.Title className="w-100 text-center">
          <div style={{ fontSize: 40 }}>🍽️</div>
          <h4 className="mt-2 mb-0">Estamos cerrados</h4>
          <p className="text-muted small mt-1 mb-0">
            En este momento no estamos recibiendo pedidos.
          </p>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <h6 className="fw-bold mb-3 text-center">Horarios de atención</h6>
        <table className="table table-sm mb-0">
          <tbody>
            {schedule.map(({ dayOfWeek, dayName, slots }) => (
              <tr
                key={dayOfWeek}
                className={dayOfWeek === TODAY_DOW ? 'table-warning' : ''}
              >
                <td className="fw-semibold" style={{ width: '38%' }}>
                  {dayOfWeek === TODAY_DOW ? <strong>{dayName}</strong> : dayName}
                </td>
                <td>
                  {slots.length === 0 ? (
                    <span className="text-muted">Cerrado</span>
                  ) : (
                    slots.map((s, i) => (
                      <span key={i}>
                        {formatTime(s.open_time)} – {formatTime(s.close_time)}
                        {i < slots.length - 1 && <br />}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal.Body>
    </Modal>
  );
};

export default ClosedModal;
