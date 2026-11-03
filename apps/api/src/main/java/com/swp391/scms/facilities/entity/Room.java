package com.swp391.scms.facilities.entity;

import jakarta.persistence.*;
import java.time.LocalTime;

/** Entity mapping table rooms (Module B: Master Facilities). */
@Entity
@org.hibernate.annotations.Check(name = "ck_rooms_status", constraints = "status IN ('available','maintenance','closed')")
@Table(name = "rooms")
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 150)
    private String location;

    @Column(nullable = false)
    private int capacity;

    @Column(nullable = false, length = 20)
    private String status = "available"; // available, maintenance, closed

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "discipline_id")
    private Discipline discipline;

    @Column(name = "open_time")
    private LocalTime openTime;

    @Column(name = "close_time")
    private LocalTime closeTime;

    @Column(length = 30)
    private String tier = "STANDARD"; // STANDARD, PLATINUM

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Discipline getDiscipline() { return discipline; }
    public void setDiscipline(Discipline discipline) { this.discipline = discipline; }
    public LocalTime getOpenTime() { return openTime; }
    public void setOpenTime(LocalTime openTime) { this.openTime = openTime; }
    public LocalTime getCloseTime() { return closeTime; }
    public void setCloseTime(LocalTime closeTime) { this.closeTime = closeTime; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
}
