package com.swp391.scms.facilities;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.swp391.scms.facilities.dto.CatalogResponses.DisciplineDto;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.facilities.dto.CatalogResponses.RoomDto;
import com.swp391.scms.facilities.service.DisciplineService;
import com.swp391.scms.facilities.service.PackageService;
import com.swp391.scms.facilities.service.RoomService;
import com.swp391.scms.facilities.repository.EquipmentRepository;
import com.swp391.scms.facilities.repository.RoomRepository;
import com.swp391.scms.facilities.entity.Room;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CatalogSeederTest {

    @Mock DisciplineService disciplines;
    @Mock RoomService rooms;
    @Mock PackageService packages;
    @Mock EquipmentRepository equipmentRepository;
    @Mock RoomRepository roomRepository;
    @InjectMocks CatalogSeeder seeder;

    @BeforeEach
    void existingEquipmentIsNotASeedTarget() {
        org.springframework.test.util.ReflectionTestUtils.setField(seeder, "equipmentRepository", equipmentRepository);
        org.springframework.test.util.ReflectionTestUtils.setField(seeder, "roomRepository", roomRepository);
        org.mockito.Mockito.lenient().when(equipmentRepository.count()).thenReturn(1L);
    }

    @Test
    void doesNotRecreateDeletedDemoEquipmentInAnExistingInventory() {
        org.mockito.Mockito.lenient().when(roomRepository.findAll()).thenReturn(List.of(
                namedRoom("Phòng Gym Tiêu chuẩn"), namedRoom("Phòng Gym VIP")));

        seeder.run(null);

        verify(equipmentRepository, never()).save(any());
    }

    @Test
    void seedsAnEmptyInventoryIntoExistingNamedGymRooms() {
        when(equipmentRepository.count()).thenReturn(0L);
        when(rooms.list()).thenReturn(List.of(
                new RoomDto(1L, "Phòng Gym Tiêu chuẩn", "Tầng 1", 50, "available", null, null, null, null, "STANDARD"),
                new RoomDto(2L, "Phòng Gym VIP", "Tầng 2", 25, "available", null, null, null, null, "PLATINUM")));
        when(roomRepository.findAll()).thenReturn(List.of(
                namedRoom("Phòng Gym Tiêu chuẩn"), namedRoom("Phòng Gym VIP")));

        seeder.run(null);

        var equipment = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.entity.Equipment.class);
        verify(equipmentRepository, times(12)).save(equipment.capture());
        org.assertj.core.api.Assertions.assertThat(equipment.getAllValues())
                .extracting(item -> item.getRoom().getName())
                .containsOnly("Phòng Gym Tiêu chuẩn", "Phòng Gym VIP");
        verify(rooms, never()).create(any());
    }

    private Room namedRoom(String name) {
        var room = new Room();
        room.setName(name);
        return room;
    }

    @Test
    void seedsEmptyCatalogs() {
        when(disciplines.list()).thenReturn(List.of());
        when(rooms.list()).thenReturn(List.of());
        when(packages.list()).thenReturn(List.of());

        seeder.run(null);

        verify(disciplines, times(6)).create(any());
        verify(rooms, times(5)).create(any());
        verify(packages, times(7)).create(any());
        var requests = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest.class);
        verify(packages, times(7)).create(requests.capture());
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.price().intValue()).toList())
                .containsExactly(0, 199000, 299000, 599000, 549000, 799000, 1599000);
    }

    @Test
    void doesNotSeedExistingCatalogs() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(new PackageDto(1L, "P", null, BigDecimal.ONE, 1, null, "active")));

        seeder.run(null);

        // "Yoga" đã có sẵn nên chỉ 5 bộ môn chuẩn còn lại được tạo thêm
        verify(disciplines, times(5)).create(any());
        verify(disciplines, never()).update(any(), any());
        verify(rooms, never()).create(any());
        verify(packages, times(7)).create(any());
    }
    @Test
    void correctsOriginalCatalogPricesWithoutChangingTermsOrManagerPrices() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(
                new PackageDto(1L, "The Essential", "8 classes", new BigDecimal("2800000"), 30, 8, "active"),
                new PackageDto(2L, "The Sanctuary VIP", "Unlimited", new BigDecimal("7500000"), 90, null, "active"),
                new PackageDto(3L, "The Sovereign Annual", "Annual", new BigDecimal("26000000"), 365, null, "active"),
                new PackageDto(4L, "Manager package", null, new BigDecimal("450000"), 45, 3, "active")));
        seeder.run(null);
        var requests = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest.class);
        verify(packages, times(3)).update(any(), requests.capture());
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.price().intValue()).toList())
                .containsExactly(299000, 499000, 999000);
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.durationDays()).toList())
                .containsExactly(30, 90, 365);
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().getFirst().classCreditLimit()).isEqualTo(8);
    }

    @Test
    void preservesManagerChangesToSeededPackage() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(new PackageDto(1L, CatalogSeeder.SILVER_NAME,
                "Manager terms", new BigDecimal("450000"), 45, 3, "inactive")));
        seeder.run(null);
        verify(packages, never()).update(any(), any());
    }

    @Test
    void retiresSixAndTwelveMonthPackagesWithoutDeletingThem() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(
                new PackageDto(7L, CatalogSeeder.SILVER_6M_NAME, null, new BigDecimal("999000"), 180, 2, "active"),
                new PackageDto(8L, CatalogSeeder.GOLD_6M_NAME, null, new BigDecimal("1499000"), 180, 5, "inactive"),
                new PackageDto(9L, CatalogSeeder.SILVER_12M_NAME, null, new BigDecimal("1799000"), 365, 2, "active"),
                new PackageDto(10L, CatalogSeeder.SILVER_3M_NAME, null, new BigDecimal("549000"), 90, 6, "active")));

        seeder.run(null);

        verify(packages).updateStatus(7L, "inactive");
        verify(packages, never()).updateStatus(8L, "inactive");
        verify(packages).updateStatus(9L, "inactive");
        verify(packages, never()).updateStatus(10L, "inactive");
        verify(packages, never()).update(any(), any());
    }

    @Test
    void renamesLegacyDisciplinesToTheCanonicalListWithoutDuplicatingThem() {
        when(disciplines.list()).thenReturn(List.of(
                new DisciplineDto(1L, "Olympic Strength", "Tạ"),
                new DisciplineDto(2L, "Thermal Aquatics", null),
                new DisciplineDto(3L, "Boxing & Kickfit", "Đấm"),
                new DisciplineDto(4L, "Tennis", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of());

        seeder.run(null);

        var requests = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.dto.CatalogRequests.DisciplineRequest.class);
        verify(disciplines, times(3)).update(any(), requests.capture());
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.name()).toList())
                .containsExactly("Gym", "Bơi lội", "Boxing");
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().getFirst().description()).isEqualTo("Tạ");
        verify(disciplines, times(2)).create(any());
    }
}
