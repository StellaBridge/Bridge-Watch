import React, { useRef, useEffect } from 'react';
import { AuditEvent } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface AuditDetailModalProps {
  event: AuditEvent;
  onClose: () => void;
}

export const AuditDetailModal: React.FC<AuditDetailModalProps> = ({ event, onClose }) => {
  const contentRef = useFocusTrap({
    isActive: true,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  });

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center" role="presentation">
      <div
        ref={contentRef as React.RefObject<HTMLDivElement>}
        className="bg-white p-6 border shadow-lg rounded-md max-w-2xl w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
      >
        <h3 id="audit-detail-title" className="text-lg leading-6 font-medium text-gray-900 mb-4">Audit Event Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><span className="font-bold">ID:</span> {event.id}</div>
          <div><span className="font-bold">Actor:</span> {event.actorId} ({event.actorType})</div>
          <div><span className="font-bold">Action:</span> {event.action}</div>
          <div><span className="font-bold">Resource:</span> {event.resourceType}:{event.resourceId}</div>
          <div><span className="font-bold">IP:</span> {event.ipAddress}</div>
          <div><span className="font-bold">Time:</span> {new Date(event.createdAt).toLocaleString()}</div>
        </div>
        
        <div className="mt-4">
          <h4 className="font-bold mb-2">Cryptographic Proof</h4>
          <div className="bg-gray-100 p-2 rounded text-xs break-all font-mono">
            Checksum: {event.checksum}
            <br />
            Previous Checksum: {event.previousChecksum || "N/A"}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-bold mb-2">Metadata</h4>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700">Close</button>
        </div>
      </div>
    </div>
  );
};
