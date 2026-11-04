package com.swp391.scms.facilities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.swp391.scms.common.exception.BadRequestException;
import com.swp391.scms.common.exception.ConflictException;
import com.swp391.scms.common.exception.ResourceNotFoundException;
import com.swp391.scms.facilities.dto.EquipmentDto;
import com.swp391.scms.facilities.dto.EquipmentRequest;
import com.swp391.scms.facilities.entity.Equipment;
import com.swp391.scms.facilities.entity.Room;
import com.swp391.scms.facilities.repository.EquipmentRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.facilities.service.EquipmentService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EquipmentServiceTest {

    @Mock
    private EquipmentRepository equipmentRepository;

    @Mock
    private RoomRepository roomRepository;

    @InjectMocks
    private EquipmentService equipmentService;

    private Room sampleRoom;
    private Equipment sampleEquipment;

    @BeforeEach
    void setUp() {
        sampleRoom = new Room();
        sampleRoom.setId(10L);
        sampleRoom.setName("Phòng Gym Tiêu chuẩn");

        sampleEquipment = new Equipment("Máy chạy bộ Pro", "EQ-01", "Cardio", sampleRoom, 5, "active");
        sampleEquipment.setId(1L);
    }

    @Test
    @DisplayName("Lấy danh sách thiết bị tất cả hoặc theo phòng")
    void list_returnsEquipmentList() {
        when(equipmentRepository.findAllWithRoom()).thenReturn(List.of(sampleEquipment));
        when(equipmentRepository.findByRoomId(10L)).thenReturn(List.of(sampleEquipment));

        List<EquipmentDto> all = equipmentService.list(null);
        assertThat(all).hasSize(1);
        assertThat(all.getFirst().name()).isEqualTo("Máy chạy bộ Pro");

        List<EquipmentDto> byRoom = equipmentService.list(10L);
        assertThat(byRoom).hasSize(1);
        assertThat(byRoom.getFirst().roomId()).isEqualTo(10L);
    }

    @Test
    @DisplayName("Tạo mới thiết bị thành công")
    void create_success() {
        EquipmentRequest req = new EquipmentRequest("Giàn tạ Smith", "EQ-02", "Strength", 10L, 2, "active");
        when(equipmentRepository.existsByCode("EQ-02")).thenReturn(false);
        when(roomRepository.findById(10L)).thenReturn(Optional.of(sampleRoom));
        when(equipmentRepository.save(any(Equipment.class))).thenAnswer(i -> {
            Equipment e = i.getArgument(0);
            e.setId(2L);
            return e;
        });

        EquipmentDto created = equipmentService.create(req);
        assertThat(created.id()).isEqualTo(2L);
        assertThat(created.name()).isEqualTo("Giàn tạ Smith");
        assertThat(created.code()).isEqualTo("EQ-02");
    }

    @Test
    @DisplayName("Ném ConflictException khi mã thiết bị đã tồn tại")
    void create_duplicateCode_throwsConflict() {
        EquipmentRequest req = new EquipmentRequest("Giàn tạ Smith", "EQ-01", "Strength", 10L, 2, "active");
        when(equipmentRepository.existsByCode("EQ-01")).thenReturn(true);

        assertThatThrownBy(() -> equipmentService.create(req))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    @DisplayName("Cập nhật trạng thái thiết bị thành công")
    void updateStatus_success() {
        when(equipmentRepository.findById(1L)).thenReturn(Optional.of(sampleEquipment));
        when(equipmentRepository.save(any(Equipment.class))).thenAnswer(i -> i.getArgument(0));

        EquipmentDto updated = equipmentService.updateStatus(1L, "maintenance");
        assertThat(updated.status()).isEqualTo("maintenance");
    }

    @Test
    @DisplayName("Ném BadRequestException khi trạng thái thiết bị không hợp lệ")
    void updateStatus_invalid_throwsBadRequest() {
        assertThatThrownBy(() -> equipmentService.updateStatus(1L, "invalid_status"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("Xóa thiết bị thành công")
    void delete_success() {
        when(equipmentRepository.findById(1L)).thenReturn(Optional.of(sampleEquipment));

        equipmentService.delete(1L);
        verify(equipmentRepository).delete(sampleEquipment);
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi xóa thiết bị không tồn tại")
    void delete_missing_throwsNotFound() {
        when(equipmentRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> equipmentService.delete(99L))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}

