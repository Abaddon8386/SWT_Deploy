package com.swp391.scms.facilities.service;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.EquipmentDto;
import com.swp391.scms.facilities.dto.EquipmentRequest;
import com.swp391.scms.facilities.entity.Equipment;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.EquipmentRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EquipmentService {

    private static final Set<String> VALID_STATUSES = Set.of("active", "maintenance", "broken", "retired");

    private final EquipmentRepository equipmentRepository;
    private final RoomRepository roomRepository;

    public EquipmentService(EquipmentRepository equipmentRepository, RoomRepository roomRepository) {
        this.equipmentRepository = equipmentRepository;
        this.roomRepository = roomRepository;
    }

    @Transactional(readOnly = true)
    public List<EquipmentDto> list(Long roomId) {
        List<Equipment> items = roomId != null
                ? equipmentRepository.findByRoomId(roomId)
                : equipmentRepository.findAllWithRoom();
        return items.stream().map(EquipmentDto::of).toList();
    }

    @Transactional(readOnly = true)
    public EquipmentDto get(Long id) {
        return equipmentRepository.findByIdWithRoom(id)
                .map(EquipmentDto::of)
                .orElseThrow(() -> new ResourceNotFoundException("resource.equipment", id));
    }

    @Transactional
    public EquipmentDto create(EquipmentRequest request) {
        validateCode(request.code(), null);
        Room room = resolveRoom(request.roomId());

        Equipment equipment = new Equipment();
        apply(equipment, request, room);
        return EquipmentDto.of(equipmentRepository.save(equipment));
    }

    @Transactional
    public EquipmentDto update(Long id, EquipmentRequest request) {
        Equipment equipment = equipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.equipment", id));

        validateCode(request.code(), id);
        Room room = resolveRoom(request.roomId());

        apply(equipment, request, room);
        return EquipmentDto.of(equipmentRepository.save(equipment));
    }

    @Transactional
    public EquipmentDto updateStatus(Long id, String status) {
        if (status == null || !VALID_STATUSES.contains(status.trim().toLowerCase())) {
            throw new BadRequestException("EQUIPMENT_INVALID_STATUS", "validation.equipment.status.invalid", null, "Invalid equipment status");
        }
        Equipment equipment = equipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.equipment", id));

        equipment.setStatus(status.trim().toLowerCase());
        return EquipmentDto.of(equipmentRepository.save(equipment));
    }

    @Transactional
    public void delete(Long id) {
        Equipment equipment = equipmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("resource.equipment", id));
        equipmentRepository.delete(equipment);
    }

    private void apply(Equipment equipment, EquipmentRequest request, Room room) {
        equipment.setName(request.name().trim());
        equipment.setCode(request.code() != null && !request.code().isBlank() ? request.code().trim() : null);
        equipment.setCategory(request.category() != null && !request.category().isBlank() ? request.category().trim() : "Khác");
        equipment.setRoom(room);
        equipment.setQuantity(request.quantity() > 0 ? request.quantity() : 1);
        equipment.setStatus(request.status() != null && !request.status().isBlank() ? request.status().trim().toLowerCase() : "active");
        equipment.setPurchaseDate(request.purchaseDate());
        equipment.setMaintenanceDate(request.maintenanceDate());
        equipment.setNote(request.note() != null ? request.note().trim() : null);
    }

    private Room resolveRoom(Long roomId) {
        if (roomId == null) return null;
        return roomRepository.findById(roomId)
                .orElseThrow(() -> new ResourceNotFoundException("resource.room", roomId));
    }

    private void validateCode(String code, Long excludeId) {
        if (code == null || code.isBlank()) return;
        boolean exists = excludeId != null
                ? equipmentRepository.existsByCodeAndIdNot(code.trim(), excludeId)
                : equipmentRepository.existsByCode(code.trim());
        if (exists) {
            throw new ConflictException("EQUIPMENT_CODE_EXISTS", "error.equipment.code_exists", null, "Equipment code already exists");
        }
    }
}

